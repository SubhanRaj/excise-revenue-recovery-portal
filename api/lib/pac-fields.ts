// Single source of truth now that the UI and API share one app — re-exported from
// @/db/schema (the Drizzle schema file) rather than redefined, since that's where the DB's own
// notion of a financial year already lives.
export { FINANCIAL_YEARS, type FinancialYear } from "@/db/schema";
import { FINANCIAL_YEARS, type FinancialYear } from "@/db/schema";

export type MoneyField = "grossArrears" | "rcAmount" | "recoveredAmount" | "stayAmount";
export type CountField = "rcCount" | "stayCount";
export type PacField = MoneyField | CountField;

export const MONEY_FIELDS: MoneyField[] = ["grossArrears", "rcAmount", "recoveredAmount", "stayAmount"];
export const COUNT_FIELDS: CountField[] = ["rcCount", "stayCount"];

export const PAC_FIELD_ORDER: PacField[] = [
  "grossArrears",
  "rcCount",
  "rcAmount",
  "recoveredAmount",
  "stayCount",
  "stayAmount",
];

// Bilingual by design — these are the only labels in the UI required to carry Hindi
// (the government PAC/RC form's field names). Everything else (buttons, nav, alerts) is English.
// Numbered 2-5 because Opening Balance (OPENING_BALANCE_LABEL below) leads as "1." — it displays
// first in every view (YearStepForm, MasterView, admin district detail, admin districts table,
// Excel export), so it takes the first number and everything else shifts down one.
export const PAC_FIELD_LABELS: Record<PacField, string> = {
  grossArrears: "2. Gross Arrears / सकल बकाया धनराशि",
  rcCount: "3. (i) No. of RCs Issued / जारी आर.सी. (R.C.) की संख्या",
  rcAmount: "3. (ii) RC Amount / आर.सी. में निहित धनराशि",
  recoveredAmount: "4. Recovered Amount / वसूल की गयी धनराशि",
  stayCount: "5. (i) No. of Stay Orders / स्थगन आदेशों की संख्या",
  stayAmount: "5. (ii) Stayed Amount / सक्षम न्यायालय द्वारा स्थगित धनराशि",
};

// Opening Balance isn't one of the six DEO-entered PAC_FIELD_ORDER fields (it's a computed
// running balance — see NetRecoverableEntry below), so it lives outside PAC_FIELD_LABELS, but it
// still needs the same "N. Label / Hindi" numbering since it displays first, ahead of Gross
// Arrears, everywhere a district's per-FY figures are shown. Net Recoverable stays unnumbered —
// it's the trailing computed result, not a position in this numbered sequence.
export const OPENING_BALANCE_LABEL = "1. Opening Balance / प्रारंभिक शेष धनराशि";

export function isMoneyField(field: PacField): field is MoneyField {
  return (MONEY_FIELDS as string[]).includes(field);
}

// Per-RC breakdown behind rcCount/rcAmount (see CLAUDE.md's Data model section). Independent of
// recoveredAmount/stayAmount/openingBalance/netRecoverable: an RC is issued to inform a
// defaulter what they owe, for any amount, regardless of what's actually recovered. `stayed`
// (a court staying this specific RC) is a separate concept from the aggregate Stay Count/Stay
// Amount fields (a court staying recovery of an amount) — no cross-check between the two.
export type RcDetail = {
  rcNumber: string;
  rcAmount: number;
  stayed: boolean;
};

export const RC_NUMBER_MAX_LENGTH = 50;

// Zero-trust validator — used both as YearStepForm's pre-Save&Continue client-side check and
// the submit route's final server-side check on the untrusted request body (hence the runtime
// `typeof` guards below even though RcDetail's TS type already promises these shapes).
export function validateRcDetails(rcCount: number, rcAmount: number, rcDetails: RcDetail[]): string | null {
  if (rcDetails.length !== rcCount) {
    return `RC Details must have exactly ${rcCount} entries (received ${rcDetails.length})`;
  }
  let sum = 0;
  for (let i = 0; i < rcDetails.length; i++) {
    const d = rcDetails[i];
    const rcNumber = typeof d.rcNumber === "string" ? d.rcNumber.trim() : "";
    if (!rcNumber) return `RC #${i + 1}: RC Number cannot be blank`;
    if (rcNumber.length > RC_NUMBER_MAX_LENGTH) {
      return `RC #${i + 1}: RC Number cannot exceed ${RC_NUMBER_MAX_LENGTH} characters`;
    }
    if (typeof d.rcAmount !== "number" || Number.isNaN(d.rcAmount) || d.rcAmount < 0) {
      return `RC #${i + 1}: RC Amount must be a non-negative number`;
    }
    if (typeof d.stayed !== "boolean") {
      return `RC #${i + 1}: stayed must be true or false`;
    }
    sum += d.rcAmount;
  }
  // Small epsilon, not strict equality — these are floating-point rupee amounts.
  if (Math.abs(sum - rcAmount) > 0.01) {
    return `RC Details total (${sum}) must equal RC Amount (${rcAmount})`;
  }
  return null;
}

// Strips the " / <Hindi>" half off a PAC_FIELD_LABELS entry. Shared by every admin-facing
// view (Dashboard, Districts table, Excel export) — those audiences don't need the Hindi;
// only the DEO-facing form (YearStepForm/MasterView) mirrors the actual bilingual government
// form and keeps both halves.
export function englishLabel(bilingual: string): string {
  return bilingual.split(" / ")[0];
}

// englishLabel() minus the government form's own numbering ("1.", "2. (i)", "4. (ii)") — used
// by summary/stat views (the Admin Dashboard's "All fields" list) that aren't laid out to mirror
// the form's field order/grouping the way YearStepForm/MasterView/the Districts table are, so the
// numbering there is just noise rather than a useful cross-reference.
export function plainLabel(bilingual: string): string {
  return englishLabel(bilingual).replace(/^\d+\.\s*(\([ivx]+\)\s*)?/i, "");
}

export interface NetRecoverableEntry {
  openingBalance: number;
  netRecoverable: number;
}

// Cumulative running balance (see CLAUDE.md's Data model section). For the first FY,
// openingBalance is 0. For every later FY, openingBalance is the previous FY's netRecoverable,
// and netRecoverable = max(0, openingBalance + grossArrears - recoveredAmount - stayAmount) —
// uses recoveredAmount, not rcAmount, for the same reason as before: an RC being issued for an
// amount doesn't mean that amount was actually recovered.
export function netRecoverableForYear(
  grossArrears: number,
  recoveredAmount: number,
  stayAmount: number,
  openingBalance: number
): NetRecoverableEntry {
  return {
    openingBalance,
    netRecoverable: Math.max(0, openingBalance + grossArrears - recoveredAmount - stayAmount),
  };
}

// Runs netRecoverableForYear() across every FY in order for one district, carrying each FY's
// result forward as the next FY's opening balance. Client-side, only ever used for the DEO's
// own not-yet-submitted Dexie draft (YearStepForm/MasterView) — once a district is submitted,
// every admin-facing view reads openingBalance/netRecoverable straight off the synced pac_data
// row instead of recomputing (server is the source of truth there). Server-side, the submit
// route calls this same function on the just-validated request body, where every FY is always
// present. A missing FY is treated as all-zero either way.
export function computeNetRecoverableSeries(
  fieldsByFy: Partial<Record<FinancialYear, { grossArrears: number; recoveredAmount: number; stayAmount: number }>>
): Record<FinancialYear, NetRecoverableEntry> {
  const series = {} as Record<FinancialYear, NetRecoverableEntry>;
  let openingBalance = 0;
  for (const fy of FINANCIAL_YEARS) {
    const f = fieldsByFy[fy];
    const entry = netRecoverableForYear(f?.grossArrears ?? 0, f?.recoveredAmount ?? 0, f?.stayAmount ?? 0, openingBalance);
    series[fy] = entry;
    openingBalance = entry.netRecoverable;
  }
  return series;
}
