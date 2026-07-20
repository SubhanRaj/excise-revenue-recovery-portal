import { sqliteTable, text, integer, real, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const districts = sqliteTable("districts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  districtName: text("district_name").notNull().unique(),
  lockStatus: integer("lock_status").notNull().default(0),
  // Stamped on every admin unlock (POST /api/admin/unlock) — mirrors the lock-side audit trail
  // (users.locked_at / pac_data.submitted_by_name) but on the district itself, since unlocking
  // is a district-wide action rather than something tied to one financial year's row. Only
  // ever holds the most recent unlock event, not a full history.
  unlockedAt: text("unlocked_at"),
  unlockReason: text("unlock_reason"),
  unlockedBy: text("unlocked_by"), // the admin's email
});

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  role: text("role", { enum: ["deo", "admin"] }).notNull().default("deo"),
  email: text("email").unique(),
  cugHash: text("cug_hash").unique(), // SHA-256 of 10-digit CUG mobile number
  districtId: integer("district_id").references(() => districts.id),
  lockedAt: text("locked_at"), // ISO datetime, set when DEO submits & locks
  submittedByName: text("submitted_by_name"), // DEO's name captured on final lock
  createdAt: text("created_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
  // Both nullable, admin-only in practice (ProfileMenu shows designation where "Admin" used to
  // sit, name where the email used to sit, email moved to a title-attribute tooltip on the
  // name) — not used for DEOs, whose profile display is district-driven instead.
  name: text("name"),
  designation: text("designation"),
});

export const magicLinkTokens = sqliteTable("magic_link_tokens", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().references(() => users.id),
  token: text("token").notNull().unique(),
  expiresAt: text("expires_at").notNull(),
  usedAt: text("used_at"),
});

export const pacData = sqliteTable("pac_data", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  districtId: integer("district_id").notNull().references(() => districts.id),
  financialYear: text("financial_year").notNull(), // "2021-22" .. "2025-26"

  // Numbered 2-5, not 1-4: Opening Balance (openingBalance below) is "1." since it leads every
  // per-FY view, so these six DEO-entered fields shift down one to match frontend/lib/pac-fields.ts.
  // 2. सकल बकाया धनराशि (मूल धन + ब्याज) — Gross Arrears (Principal + Interest)
  grossArrears: real("gross_arrears").notNull(),
  // 3. (i) जारी आर.सी. (R.C.) की संख्या — No. of RCs Issued
  rcCount: integer("rc_count").notNull(),
  // 3. (ii) आर.सी. में निहित धनराशि
  rcAmount: real("rc_amount").notNull(),
  // Per-RC breakdown behind rcCount/rcAmount above — JSON-stringified RcDetail[] (see
  // api/lib/rc-details.ts). One entry per RC: rcNumber, this RC's own amount, and whether a
  // court has stayed this specific RC (independent of stayCount/stayAmount below — see
  // CLAUDE.md's Data model section). Stored as a JSON string in one column (not a child table)
  // per the department's ask; the array's own rcAmount values must sum to rcAmount above,
  // enforced server-side in the submit route, never trusted from the client.
  rcDetails: text("rc_details").notNull().default("[]"),
  // 4. वसूल की गयी धनराशि — independent of rc_amount, no parity requirement (see CLAUDE.md).
  // Capped server-side (submit route) at openingBalance + grossArrears for that same FY — can't
  // recover more than was ever owed within this 5-year window (opening carry-forward + this
  // year's fresh dues); see CLAUDE.md's Validation rules section.
  recoveredAmount: real("recovered_amount").notNull(),
  // 5. (i) स्थगन आदेशों की संख्या — No. of Stay Orders
  stayCount: integer("stay_count").notNull(),
  // 5. (ii) सक्षम न्यायालय द्वारा स्थगित धनराशि
  stayAmount: real("stay_amount").notNull(),

  // Cumulative running balance, not one of the DEO-entered six fields above — computed
  // server-side by POST /api/pac-data/submit (never trusted from the client) via
  // api/lib/net-recoverable.ts's computeNetRecoverableSeries(), which walks FINANCIAL_YEARS in
  // order once per submit. openingBalance is the *previous* FY's netRecoverable (0 for the first
  // FY, 2021-22); netRecoverable = max(0, openingBalance + grossArrears - recoveredAmount -
  // stayAmount). See CLAUDE.md's Data model section for the full reasoning — this used to be
  // computed client-side and never persisted; it's now stored per FY so every admin-facing view
  // reads the same authoritative number instead of recomputing it.
  openingBalance: real("opening_balance").notNull(),
  netRecoverable: real("net_recoverable").notNull(),

  // Same name the DEO typed in the lock confirmation, duplicated from users.submitted_by_name
  // onto the revenue row itself (keyed by district_id, same as everything else in this table)
  // so Admin can see who submitted a given year's numbers without joining users.
  submittedByName: text("submitted_by_name"),
  // ISO/UTC datetime, duplicated from users.locked_at the same way and for the same reason —
  // the Admin district detail page needs "locked by X at Y" without a join. Format as IST
  // (Asia/Kolkata) only at display time (frontend/lib/format.ts); never convert on write.
  lockedAt: text("locked_at"),

  createdAt: text("created_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
}, (table) => ({
  districtYearUnique: uniqueIndex("district_year_unique").on(table.districtId, table.financialYear),
}));

// General-purpose activity trail (logins/logouts, locks/unlocks, bulk DEO provisioning) —
// modeled on the sibling up-excise-spatial-revenue-optimizer project's audit_log table.
// createdAt is always written from JS (`new Date().toISOString()`), never a SQL
// CURRENT_TIMESTAMP default — see the note on pac_data.locked_at above for why: this table's
// timestamps are shown directly to admins, so it can't afford the timezone-less-string bug.
// Rows older than 30 days are pruned opportunistically whenever the audit log is read
// (api/app/api/admin/audit-log/route.ts) rather than via a separate cron trigger.
export const auditLog = sqliteTable("audit_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  eventType: text("event_type").notNull(),
  actorRole: text("actor_role"), // "admin" | "deo" | null (system-level events)
  actorEmail: text("actor_email"), // admin's email; null for DEO events (no PII to log)
  // Captured at write time (like districtName below), not resolved via a live join against
  // users — an admin's later name/designation change shouldn't rewrite what already happened.
  // Admin-only in practice, same as users.name/designation; null for DEO events.
  actorName: text("actor_name"),
  actorDesignation: text("actor_designation"),
  districtName: text("district_name"),
  metadata: text("metadata"), // JSON string, event-specific extra detail (e.g. unlock reason)
  createdAt: text("created_at").notNull(),
});

// DEO self-service unlock requests (ROADMAP.md Milestone 28) — a locked-out DEO submits a
// plaintext reason (+ optional PDF letter in R2) instead of only contacting an Admin outside
// the app; an Admin approves (unlocks the district, same as the existing manual unlock) or
// denies. "Only one pending request per district" is enforced in application code (a
// check-then-insert in the route), not a DB constraint — this Drizzle/SQLite version has no
// clean partial-unique-index support, and the TOCTOU race is low-stakes (worst case: two
// pending rows, which the admin UI just shows both of).
export const unlockRequests = sqliteTable("unlock_requests", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  districtId: integer("district_id").notNull().references(() => districts.id),
  reason: text("reason").notNull(), // plaintext, bilingual, no rich-text/HTML — see CLAUDE.md
  attachmentKey: text("attachment_key"), // R2 object key, null if no PDF attached
  attachmentFilename: text("attachment_filename"), // original filename, display only — never used to build the R2 key
  status: text("status", { enum: ["pending", "approved", "denied"] }).notNull().default("pending"),
  requestedAt: text("requested_at").notNull(), // written from JS, never a SQL default — see pac_data.locked_at above
  resolvedAt: text("resolved_at"),
  resolvedBy: text("resolved_by"), // admin's email
  adminNote: text("admin_note"), // null while pending; always set on resolve (approve or deny) — never auto-copied from `reason`
});

export const FINANCIAL_YEARS = [
  "2021-22",
  "2022-23",
  "2023-24",
  "2024-25",
  "2025-26",
] as const;

export type FinancialYear = (typeof FINANCIAL_YEARS)[number];
