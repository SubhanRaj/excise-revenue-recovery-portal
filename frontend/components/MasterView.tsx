"use client";

import { useState } from "react";
import { FINANCIAL_YEARS, PAC_FIELD_ORDER, PAC_FIELD_LABELS, isMoneyField } from "@/lib/pac-fields";
import type { DraftYear } from "@/lib/db";

type Props = {
  years: DraftYear[];
  submittedByName: string;
  onSubmittedByNameChange: (v: string) => void;
  onSubmit: () => void;
  busy: boolean;
};

export default function MasterView({ years, submittedByName, onSubmittedByNameChange, onSubmit, busy }: Props) {
  const [nameTouched, setNameTouched] = useState(false);
  const nameMissing = submittedByName.trim().length === 0;

  return (
    <div className="space-y-4">
      <h2 className="text-base font-semibold text-zinc-900">Master View — Summary of All 5 Years</h2>

      <div className="overflow-x-auto rounded-md border border-zinc-200">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr className="bg-zinc-100">
              <th className="sticky left-0 bg-zinc-100 px-3 py-2 text-left font-medium text-zinc-700">Field</th>
              {FINANCIAL_YEARS.map((fy) => (
                <th key={fy} className="px-3 py-2 text-right font-medium text-zinc-700">
                  {fy}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PAC_FIELD_ORDER.map((field) => (
              <tr key={field} className="border-t border-zinc-200">
                <td className="sticky left-0 bg-white px-3 py-2 text-zinc-700">{PAC_FIELD_LABELS[field]}</td>
                {years.map((year) => (
                  <td key={year.financialYear} className="px-3 py-2 text-right tabular-nums">
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

      <label className="block max-w-sm">
        <span className="mb-1 block text-sm font-medium text-zinc-700">DEO Name (Submitting Officer)</span>
        <input
          type="text"
          value={submittedByName}
          onChange={(e) => onSubmittedByNameChange(e.target.value)}
          onBlur={() => setNameTouched(true)}
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500"
        />
        {nameTouched && nameMissing && <span className="mt-1 block text-xs text-red-600">Name is required.</span>}
      </label>

      <button
        type="button"
        onClick={onSubmit}
        disabled={busy || nameMissing}
        className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        Final Submit & Lock
      </button>
    </div>
  );
}
