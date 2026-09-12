# D1 Write-Quota Audit — Cross-Project Incident Check (2026-09-12)

**Status: fixed.** All six open findings (Q-01 through Q-06) below now wrap their non-essential
audit-log insert (or, for Q-01, the retention purge) in `try/catch` so a D1 write-quota failure
there can't turn an already-successful essential write into a visible 500. No schema or data
change — code only.

**Trigger:** the sibling project `up-excise-spatial-revenue-optimizer` (same developer, same
Next.js + Cloudflare Workers + D1 + Drizzle stack) hit Cloudflare D1's account-wide daily
write-row quota (100,000 rows/day, shared across every D1 database on the account) today,
breaking login and other features across that app. Root cause there was three patterns:

1. A reminder modal that intentionally reappears on every page load also wrote a fresh
   `audit_log` row on every showing — write volume scaled with page loads, not real actions.
2. Two request handlers did an essential write (e.g. creating a session) immediately followed
   by a second, non-essential write (an audit-log insert) as a separate unguarded statement —
   when the second write failed, the exception thrown after the first had already succeeded
   turned a real success into a visible 500.
3. A read route ran an unconditional "purge old rows" `DELETE` before every read, no fallback —
   a failed purge blocked the read that would otherwise have returned fine.

This project's Cloudflare account has 5 D1 databases sharing that one 100,000-row/day pool, and
`excise-revenue-recovery-db` (this repo's database) is one of them — a write-heavy day here can
help exhaust the same quota that broke the other app, and vice versa. This doc records what a
sweep of this codebase for the same three patterns found.

**Confirmed:** this repo uses Cloudflare D1 — `api/wrangler.jsonc` binds `DB` to
`excise-revenue-recovery-db` (`database_id: 4f3e37fd-006a-4bce-b2d3-4bfb8bb16248`), same account
as the sibling project.

---

## Status Summary

| ID | Finding | Pattern | Status |
|----|---------|---------|--------|
| Q-01 | `GET /api/admin/audit-log` runs an unconditional purge `DELETE` before every read, no try/catch | #3 (write-before-read, no fallback) | **FIXED** |
| Q-02 | `POST /api/auth/verify-magic-link` marks the token used, then a separate unguarded audit-log insert can fail and burn the one-time token with no session granted | #2 (essential write, then unguarded non-essential write) | **FIXED** |
| Q-03 | `POST /api/auth/verify-cug` grants a session only after an unguarded audit-log insert; a failure there turns a valid login into a 500 | #2 | **FIXED** |
| Q-04 | `POST/PATCH /api/admin/users` (create, update) each do the essential write, then a separate unguarded audit-log insert | #2 | **FIXED** |
| Q-05 | `DELETE /api/admin/users` batches the essential deletes atomically, but the following audit-log insert is a separate unguarded call | #2 | **FIXED** |
| Q-06 | `POST /api/admin/provision-deos` commits every row's insert/update individually inside the loop, then a single unguarded audit-log insert at the end | #2 (bulk variant) | **FIXED** |
| — | Reminder/dismiss-modal-writes-per-page-load (pattern #1) | #1 | **NOT FOUND** — no reminder-modal-on-page-load write pattern exists in this codebase |
| — | `POST /api/auth/logout` already wraps its audit-log insert in `.catch(() => {})` | #2 (already fixed) | **PASS** (reference the existing fix pattern) |
| — | `admin/unlock`, `admin/unlock-requests/resolve`, `deo/request-unlock`, `admin/truncate-demo-data`, `pac-data/submit` all fold the audit-log insert into the same atomic `db.batch()` as the essential write(s) | #2 | **PASS** |

Nothing matching pattern #1 (writes that scale with page loads rather than real actions) was
found — no route in this codebase writes to D1 from a GET handler, and no client-side
`useEffect`-on-mount fires a write; every mount-time `apiFetch` call found in `app/**/*.tsx` is a
`GET`. `app/api/auth/me/route.ts` (called once per gated-page load) and `app/api/auth/request-magic-link/route.ts`'s rate-limit accounting (`lib/rate-limit.ts`, keyed by real login attempts) are the only per-load/per-attempt D1 traffic on the auth path, and both are load-bearing (session state, brute-force protection), not incidental.

---

## Q-01 · Unconditional Purge Before Read — `app/api/admin/audit-log/route.ts:23`

```ts
const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
await db.delete(auditLog).where(lt(auditLog.createdAt, cutoff));   // line 23 — unguarded

const rows = await db.select().from(auditLog)...                   // never reached if the DELETE throws
```

Same shape as the sibling project's fixed retention-purge bug: the 30-day retention prune runs
on every page load of `/admin/audit`, with no `try/catch`. If the account-wide write quota is
exhausted (or D1 has a transient blip), the `DELETE` throws, `withErrorHandling` catches it and
returns a generic 500 — the admin audit log page goes blank even though the actual read (line
26+) would have worked fine.

**Recommended fix:** wrap the purge in `try/catch` (log and swallow) so a failed prune just
skips cleanup for this visit instead of blocking the read — mirrors the sibling project's fix to
its own equivalent route.

---

## Q-02 · Magic-Link Verify Burns the Token Before an Unguarded Audit Write — `app/api/auth/verify-magic-link/route.ts:35,45`

```ts
await db.update(magicLinkTokens).set({ usedAt: ... }).where(...)   // line 33-35 — essential, marks the one-time token used
...
await auditLogInsert(db, { eventType: "login_magic_link", ... })   // line 45 — separate, unguarded
...
const res = NextResponse.json(...)                                  // cookie set only after the line above succeeds
```

If the audit insert at line 45 throws, the magic-link token has already been marked used (line
35), but the session cookie is never set — the request fails with a 500 and the admin cannot
retry with the same link (it's already burned), even though the login itself would otherwise
have succeeded. Worse than the plain "masked success" case, since it also destroys the one-time
credential.

**Recommended fix:** wrap the `auditLogInsert` call in `try/catch` (swallow, same as `logout`'s
existing `.catch(() => {})` at `app/api/auth/logout/route.ts:39`), so an audit-log failure can
never block a successful login or waste the token.

---

## Q-03 · CUG Verify Blocks a Valid Login on an Unguarded Audit Write — `app/api/auth/verify-cug/route.ts:57`

```ts
const token = await signSession(...)          // in-memory, no D1 write
await auditLogInsert(db, { eventType: "login_cug", ... })   // line 57 — unguarded
const res = NextResponse.json(...)             // cookie set only after
```

Same shape as Q-02 without the burned-token side effect: a valid CUG hash match, followed by a
failed audit insert, produces a 500 instead of a granted session. The rate-limit counter
(`lib/rate-limit.ts`) has already been incremented for this attempt regardless.

**Recommended fix:** same as Q-02 — wrap `auditLogInsert` in `try/catch`.

---

## Q-04 · Admin User Create/Update — `app/api/admin/users/route.ts:63,66` and `:121,123`

```ts
await db.insert(users).values({ role: "admin", ... })   // line 63 — essential, already committed
...
await auditLogInsert(db, { eventType: "admin_user_created", ... })   // line 66 — unguarded
```

```ts
await db.update(users).set(values).where(eq(users.id, targetId))   // line 121 — essential, already committed
...
await auditLogInsert(db, { eventType: "admin_user_updated", ... })   // line 123 — unguarded
```

In both handlers, the account row is already created/updated in D1 by the time the audit insert
runs. If that insert fails, the owner sees a 500 and no confirmation — for **create**, retrying
the same request hits the `email already in use` 409 from an account that in fact was created
successfully; for **update**, retrying is harmless but still misleads the owner into thinking
the edit didn't take.

**Recommended fix:** wrap each `auditLogInsert` call in `try/catch`, or fold it into a
`db.batch()` with the essential write the way `admin/unlock/route.ts` and
`admin/unlock-requests/resolve/route.ts` already do in this same codebase.

---

## Q-05 · Admin User Delete — `app/api/admin/users/route.ts:153,158`

```ts
await db.batch([
  db.delete(magicLinkTokens).where(eq(magicLinkTokens.userId, targetId)),
  db.delete(users).where(eq(users.id, targetId)),
]);                                                          // line 153 — essential, atomic, already committed
...
await auditLogInsert(db, { eventType: "admin_user_deleted", ... })   // line 158 — separate, unguarded
```

The account is already gone from D1 by the time the audit insert runs; a failure there reports
a 500 for what was in fact a successful deletion.

**Recommended fix:** either wrap the `auditLogInsert` in `try/catch`, or add it as a third
statement inside the `db.batch()` call at line 153 (this route already imports `auditLogInsert`
and every other write route in this file uses the same helper — folding it in matches the
pattern `admin/unlock/route.ts` uses).

---

## Q-06 · Bulk DEO Provisioning — `app/api/admin/provision-deos/route.ts:96,99,111`

```ts
for (const raw of rows) {
  ...
  await db.update(users).set(values)...      // line 96 — essential, committed per-row
  // or
  await db.insert(users).values(...)         // line 99 — essential, committed per-row
}
...
await auditLogInsert(db, { eventType: "deo_provisioned", ... })   // line 111 — one insert, after the whole loop, unguarded
```

Every row's insert/update is already committed individually as the loop runs (by design — one
bad row shouldn't abort the other 74, per the comment at line 70-73). If the single summary
`auditLogInsert` after the loop fails, the admin gets a 500 and never sees the per-row results
table, even though up to 75 districts' worth of DEO accounts were in fact just
inserted/updated — reads as "the whole bulk upload failed" when it didn't.

**Recommended fix:** wrap the trailing `auditLogInsert` in `try/catch` so a failure there can't
hide the `results` array the admin actually needs to see.

---

## What "already correct" looks like here

Several routes in this same codebase already avoid this bug shape entirely by putting the
audit-log insert inside the same `db.batch()` as the essential write(s), which is atomic — a
quota failure fails the whole batch (and the whole request, honestly, reporting an error) rather
than silently succeeding on the essential part and only failing the audit trail:

- `app/api/admin/unlock/route.ts`
- `app/api/admin/unlock-requests/resolve/route.ts`
- `app/api/deo/request-unlock/route.ts`
- `app/api/admin/truncate-demo-data/route.ts`
- `app/api/pac-data/submit/route.ts`

And `app/api/auth/logout/route.ts:39` already wraps its (non-atomic, separate) audit insert in
`.catch(() => {})` — the same fix Q-02 through Q-06 above are missing. That existing line is the
shortest reference for what the fix looks like for the non-batchable cases (Q-02, Q-03, where
the audit insert has to happen after a fact not yet known when the essential write ran).
