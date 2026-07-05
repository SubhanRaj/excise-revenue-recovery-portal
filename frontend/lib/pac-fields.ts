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

// gross_arrears - (recovered_amount + stay_amount), floored at 0. Display-only — never
// persisted. Uses recovered_amount, not rc_amount — an RC being issued for an amount doesn't
// mean that amount was actually recovered, so these two fields are independent (no parity
// requirement between them; see CLAUDE.md's Validation rules).
export function netRecoverable(grossArrears: number, recoveredAmount: number, stayAmount: number): number {
  return Math.max(0, grossArrears - recoveredAmount - stayAmount);
}
