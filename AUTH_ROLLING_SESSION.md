# Auth Rolling-Session Note (for Claude)

Checked 2026-08-07 (cross-project scan for `excise-budget-tracker`): the
"7-day rolling session / forever OTP-skip" pattern is **confirmed NOT present**
here, despite this project sharing the same Next.js/Cloudflare D1 boilerplate
as [up-excise-spatial-revenue-optimizer](../up-excise-spatial-revenue-optimizer/AUTH_ROLLING_SESSION.md),
which does have a real implementation (`maybeRenewAdminSession()` in
`apps/web/src/lib/auth.ts`). If asked to add it here, port that pattern
rather than inventing a new one — don't re-conclude "not found" without
re-grepping first, this repo may have since converged with its sibling.
