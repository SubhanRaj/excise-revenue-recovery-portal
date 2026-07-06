"use client";

import { FINANCIAL_YEARS, PAC_FIELD_ORDER, PAC_FIELD_LABELS, OPENING_BALANCE_LABEL, isMoneyField, computeNetRecoverableSeries } from "@/lib/pac-fields";
import type { DraftYear } from "@/lib/db";
import Button from "./ui/Button";
import Banner from "./ui/Banner";

type Props = {
  years: DraftYear[];
  districtName?: string | null;
  onSubmit: () => void;
  busy: boolean;
  error: string | null;
};

// The DEO's name is collected in the "Verify & Lock" SweetAlert2 prompt at submit time
// (lib/alerts.ts's promptDeoNameAndLock), not as a field on this page — keeps it right next
// to the irreversibility/liability disclaimer instead of a form field easy to skim past.
export default function MasterView({ years, districtName, onSubmit, busy, error }: Props) {
  // Computed live from the draft, not yet in D1 until Submit & Lock — see CLAUDE.md's Data
  // model section. Once submitted, every admin-facing view reads the stored pac_data columns
  // instead of recomputing this.
  const netRecoverableSeries = computeNetRecoverableSeries(
    Object.fromEntries(
      years.map((y) => [
        y.financialYear,
        {
          grossArrears: Number(y.grossArrears) || 0,
          recoveredAmount: Number(y.recoveredAmount) || 0,
          stayAmount: Number(y.stayAmount) || 0,
        },
      ])
    )
  );

  return (
    <div className="space-y-5">
      <div className="border-b border-slate-100 pb-4 text-center dark:border-slate-800">
        <div className="flex items-center justify-center gap-2">
          <i className="ti ti-clipboard-list text-xl text-blue-600 dark:text-blue-400" />
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Master View — Summary of All 5 Years{districtName ? ` for ${districtName}` : ""}
          </h2>
        </div>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          मास्टर व्यू — {districtName ? `${districtName} के लिए ` : ""}सभी 5 वर्षों का सारांश
        </p>
      </div>

      {/* Auto (not fixed) table layout — columns grow to fit content, so a crore-scale amount
          (e.g. ₹10,00,00,000.00) widens its column instead of wrapping/clipping. overflow-x-auto
          is just the fallback once the total width exceeds a narrow viewport. */}
      <div className="overflow-x-auto rounded-lg border border-slate-200 [scrollbar-width:thin] scroll-smooth dark:border-slate-800">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-slate-50 dark:bg-slate-900">
              <th className="sticky left-0 min-w-[220px] bg-slate-50 px-4 py-3 text-left font-medium text-slate-600 dark:bg-slate-900 dark:text-slate-400">
                Field
              </th>
              {FINANCIAL_YEARS.map((fy) => (
                <th
                  key={fy}
                  className="whitespace-nowrap px-4 py-3 text-right font-medium text-slate-600 dark:text-slate-400"
                >
                  FY {fy}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-slate-100 bg-slate-50 font-medium text-slate-800 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-200">
              <td className="sticky left-0 bg-inherit px-4 py-3">{OPENING_BALANCE_LABEL}</td>
              {years.map((year) => (
                <td key={year.financialYear} className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                  ₹{netRecoverableSeries[year.financialYear].openingBalance.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </td>
              ))}
            </tr>
            {PAC_FIELD_ORDER.map((field, i) => (
              <tr
                key={field}
                className={`border-t border-slate-100 dark:border-slate-800 ${
                  i % 2 === 1 ? "bg-slate-50 dark:bg-slate-900" : "bg-white dark:bg-slate-950"
                }`}
              >
                <td className="sticky left-0 bg-inherit px-4 py-3 text-slate-700 dark:text-slate-300">
                  {PAC_FIELD_LABELS[field]}
                </td>
                {years.map((year) => (
                  <td
                    key={year.financialYear}
                    className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-slate-900 dark:text-slate-100"
                  >
                    {isMoneyField(field)
                      ? `₹${(Number(year[field]) || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`
                      : (Number(year[field]) || 0).toLocaleString("en-IN")}
                  </td>
                ))}
              </tr>
            ))}
            <tr className="border-t-2 border-slate-300 bg-slate-50 font-semibold text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
              <td className="sticky left-0 bg-inherit px-4 py-3">Net Recoverable / शुद्ध वसूली योग्य धनराशि</td>
              {years.map((year) => (
                <td key={year.financialYear} className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                  ₹{netRecoverableSeries[year.financialYear].netRecoverable.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      {error && <Banner variant="error">{error}</Banner>}

      <Button type="button" variant="dark" size="lg" onClick={onSubmit} disabled={busy} className="w-full">
        <i className="ti ti-lock shrink-0 text-xl" />
        {busy ? "Submitting..." : "Submit & Lock"}
      </Button>
    </div>
  );
}
