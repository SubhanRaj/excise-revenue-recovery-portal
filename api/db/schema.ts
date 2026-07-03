import { sqliteTable, text, integer, real, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const districts = sqliteTable("districts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  districtName: text("district_name").notNull().unique(),
  lockStatus: integer("lock_status").notNull().default(0),
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

  // 1. सकल बकाया धनराशि
  grossArrears: real("gross_arrears").notNull(),
  // 2. (i) प्रेषित आर.सी. (R.C.) की संख्या
  rcCount: integer("rc_count").notNull(),
  // 2. (ii) आर.सी. में निहित धनराशि
  rcAmount: real("rc_amount").notNull(),
  // 3. वसूल की गयी धनराशि
  recoveredAmount: real("recovered_amount").notNull(),
  // 4. (i) स्थगन आदेशों की संख्या
  stayCount: integer("stay_count").notNull(),
  // 4. (ii) सक्षम न्यायालय द्वारा स्थगित धनराशि
  stayAmount: real("stay_amount").notNull(),

  createdAt: text("created_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
}, (table) => ({
  districtYearUnique: uniqueIndex("district_year_unique").on(table.districtId, table.financialYear),
}));

export const FINANCIAL_YEARS = [
  "2021-22",
  "2022-23",
  "2023-24",
  "2024-25",
  "2025-26",
] as const;

export type FinancialYear = (typeof FINANCIAL_YEARS)[number];
