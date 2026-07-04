"use client";

import { FINANCIAL_YEARS, PAC_FIELD_ORDER, PAC_FIELD_LABELS, isMoneyField } from "@/lib/pac-fields";
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
  return (
    <div className="space-y-5">
      <div className="border-b border-slate-100 pb-4 text-center">
        <div className="flex items-center justify-center gap-2">
          <i className="ti ti-clipboard-list text-xl text-indigo-600" />
          <h2 className="text-base font-semibold text-slate-900">
            Master View — Summary of All 5 Years{districtName ? ` for ${districtName}` : ""}
          </h2>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          मास्टर व्यू — {districtName ? `${districtName} के लिए ` : ""}सभी 5 वर्षों का सारांश
        </p>
      </div>

      {/* Auto (not fixed) table layout — columns grow to fit content, so a crore-scale amount
          (e.g. ₹10,00,00,000.00) widens its column instead of wrapping/clipping. overflow-x-auto
          is just the fallback once the total width exceeds a narrow viewport. */}
      <div className="overflow-x-auto rounded-lg border border-slate-200 [scrollbar-width:thin] scroll-smooth">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-slate-50">
              <th className="sticky left-0 min-w-[220px] bg-slate-50 px-4 py-3 text-left font-medium text-slate-600">
                Field
              </th>
              {FINANCIAL_YEARS.map((fy) => (
                <th key={fy} className="whitespace-nowrap px-4 py-3 text-right font-medium text-slate-600">
                  {fy}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PAC_FIELD_ORDER.map((field, i) => (
              <tr key={field} className={`border-t border-slate-100 ${i % 2 === 1 ? "bg-slate-50" : "bg-white"}`}>
                <td className="sticky left-0 bg-inherit px-4 py-3 text-slate-700">{PAC_FIELD_LABELS[field]}</td>
                {years.map((year) => (
                  <td
                    key={year.financialYear}
                    className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-slate-900"
                  >
                    {isMoneyField(field)
                      ? `₹${(Number(year[field]) || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`
                      : (Number(year[field]) || 0).toLocaleString("en-IN")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {error && <Banner variant="error">{error}</Banner>}

      <Button type="button" variant="danger" size="lg" onClick={onSubmit} disabled={busy} className="w-full">
        <i className="ti ti-lock text-xl" />
        {busy ? "Submitting..." : "Submit & Lock"}
      </Button>
    </div>
  );
}
