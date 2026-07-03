"use client";

import { useState } from "react";
import { FINANCIAL_YEARS, PAC_FIELD_ORDER, PAC_FIELD_LABELS, isMoneyField } from "@/lib/pac-fields";
import type { DraftYear } from "@/lib/db";
import Button from "./ui/Button";
import TextField from "./ui/TextField";

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
    <div className="space-y-5">
      <div className="flex items-center gap-2 border-b border-slate-100 pb-4">
        <i className="ti ti-clipboard-list text-xl text-indigo-600" />
        <h2 className="text-base font-semibold text-slate-900">Master View — Summary of All 5 Years</h2>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr className="bg-slate-50">
              <th className="sticky left-0 bg-slate-50 px-3 py-2.5 text-left font-medium text-slate-600">Field</th>
              {FINANCIAL_YEARS.map((fy) => (
                <th key={fy} className="px-3 py-2.5 text-right font-medium text-slate-600">
                  {fy}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PAC_FIELD_ORDER.map((field, i) => (
              <tr key={field} className={`border-t border-slate-100 ${i % 2 === 1 ? "bg-slate-50/50" : ""}`}>
                <td className="sticky left-0 bg-inherit px-3 py-2.5 text-slate-700">{PAC_FIELD_LABELS[field]}</td>
                {years.map((year) => (
                  <td key={year.financialYear} className="px-3 py-2.5 text-right tabular-nums text-slate-900">
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

      <div className="max-w-sm">
        <TextField
          label="DEO Name (Submitting Officer)"
          icon="ti-user"
          type="text"
          value={submittedByName}
          onChange={(e) => onSubmittedByNameChange(e.target.value)}
          onBlur={() => setNameTouched(true)}
        />
        {nameTouched && nameMissing && <span className="mt-1 block text-xs text-red-600">Name is required.</span>}
      </div>

      <Button type="button" variant="danger" onClick={onSubmit} disabled={busy || nameMissing}>
        <i className="ti ti-lock text-base" />
        {busy ? "Submitting..." : "Final Submit & Lock"}
      </Button>
    </div>
  );
}
