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

export const PAC_FIELD_LABELS: Record<PacField, string> = {
  grossArrears: "1. सकल बकाया धनराशि",
  rcCount: "2. (i) प्रेषित आर.सी. (R.C.) की संख्या",
  rcAmount: "2. (ii) आर.सी. में निहित धनराशि",
  recoveredAmount: "3. वसूल की गयी धनराशि",
  stayCount: "4. (i) स्थगन आदेशों की संख्या",
  stayAmount: "4. (ii) सक्षम न्यायालय द्वारा स्थगित धनराशि",
};

export function isMoneyField(field: PacField): field is MoneyField {
  return (MONEY_FIELDS as string[]).includes(field);
}

// gross_arrears - recovered_amount - stay_amount, floored at 0. Display-only — never persisted.
export function netRecoverable(grossArrears: number, recoveredAmount: number, stayAmount: number): number {
  return Math.max(0, grossArrears - recoveredAmount - stayAmount);
}
