// Mirrors api/db/schema.ts field-by-field. Kept duplicated on purpose — frontend and api
// are decoupled deployments with no shared package.
export const FINANCIAL_YEARS = [
  "2021-22",
  "2022-23",
  "2023-24",
  "2024-25",
  "2025-26",
] as const;

export type FinancialYear = (typeof FINANCIAL_YEARS)[number];

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
export const PAC_FIELD_LABELS: Record<PacField, string> = {
  grossArrears: "1. Gross Arrears (Principal + Interest) / सकल बकाया धनराशि (मूल धन + ब्याज)",
  rcCount: "2. (i) No. of RCs Issued / जारी आर.सी. (R.C.) की संख्या",
  rcAmount: "2. (ii) RC Amount / आर.सी. में निहित धनराशि",
  recoveredAmount: "3. Recovered Amount / वसूल की गयी धनराशि",
  stayCount: "4. (i) No. of Stay Orders / स्थगन आदेशों की संख्या",
  stayAmount: "4. (ii) Stayed Amount / सक्षम न्यायालय द्वारा स्थगित धनराशि",
};

export function isMoneyField(field: PacField): field is MoneyField {
  return (MONEY_FIELDS as string[]).includes(field);
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

// Cumulative running balance, mirrored server-side in api/lib/net-recoverable.ts (see CLAUDE.md's
// Data model section) — kept duplicated on purpose, same as every other cross-app constant. For
// the first FY, openingBalance is 0. For every later FY, openingBalance is the previous FY's
// netRecoverable, and netRecoverable = max(0, openingBalance + grossArrears - recoveredAmount -
// stayAmount) — uses recoveredAmount, not rcAmount, for the same reason as before: an RC being
// issued for an amount doesn't mean that amount was actually recovered.
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
// result forward as the next FY's opening balance. Only ever used for the DEO's own
// not-yet-submitted Dexie draft (YearStepForm/MasterView) — once a district is submitted, every
// admin-facing view reads openingBalance/netRecoverable straight off the synced pac_data row
// instead of recomputing (server is the source of truth there). A missing FY is treated as
// all-zero, same as every other place in this app that reads a possibly-absent pac_data row.
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
