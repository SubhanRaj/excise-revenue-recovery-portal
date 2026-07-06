import { FINANCIAL_YEARS, type FinancialYear } from "@/db/schema";

// Mirrors frontend/lib/pac-fields.ts's function of the same name byte-for-byte (see CLAUDE.md's
// Data model section) — kept duplicated on purpose, same as every other cross-app constant in
// this repo. FY 2021-22 (the first FY) always opens at 0; every later FY's opening balance is
// the previous FY's netRecoverable.
export function computeNetRecoverableSeries(
  fieldsByFy: Record<FinancialYear, { grossArrears: number; recoveredAmount: number; stayAmount: number }>
): Record<FinancialYear, { openingBalance: number; netRecoverable: number }> {
  const series = {} as Record<FinancialYear, { openingBalance: number; netRecoverable: number }>;
  let openingBalance = 0;
  for (const fy of FINANCIAL_YEARS) {
    const f = fieldsByFy[fy];
    const netRecoverable = Math.max(0, openingBalance + f.grossArrears - f.recoveredAmount - f.stayAmount);
    series[fy] = { openingBalance, netRecoverable };
    openingBalance = netRecoverable;
  }
  return series;
}
