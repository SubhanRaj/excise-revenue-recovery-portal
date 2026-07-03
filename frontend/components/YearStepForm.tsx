"use client";

import PacFieldInput from "./PacFieldInput";
import { PAC_FIELD_ORDER, PAC_FIELD_LABELS, isMoneyField, netRecoverable } from "@/lib/pac-fields";
import type { DraftYear } from "@/lib/db";
import Button from "./ui/Button";

type Props = {
  year: DraftYear;
  onFieldChange: (field: keyof DraftYear, value: string) => void;
  onSaveAndContinue: () => void;
  isLastYear: boolean;
};

export default function YearStepForm({ year, onFieldChange, onSaveAndContinue, isLastYear }: Props) {
  const gross = Number(year.grossArrears) || 0;
  const recovered = Number(year.recoveredAmount) || 0;
  const stay = Number(year.stayAmount) || 0;
  const rcAmount = Number(year.rcAmount) || 0;

  const parityOk = year.rcAmount === "" || year.recoveredAmount === "" || rcAmount === recovered;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 border-b border-slate-100 pb-4">
        <i className="ti ti-calendar-stats text-xl text-indigo-600" />
        <h2 className="text-base font-semibold text-slate-900">Financial Year {year.financialYear}</h2>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {PAC_FIELD_ORDER.map((field) => (
          <PacFieldInput
            key={field}
            label={PAC_FIELD_LABELS[field]}
            value={year[field]}
            money={isMoneyField(field)}
            onChange={(raw) => onFieldChange(field, raw)}
          />
        ))}
      </div>

      {!parityOk && (
        <p className="flex items-center gap-1.5 rounded-md bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
          <i className="ti ti-alert-triangle text-base" />
          Recovered Amount (3) must equal RC Amount (2.ii).
        </p>
      )}

      <div className="flex items-center justify-between rounded-lg border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm">
        <span className="font-medium text-indigo-900">Net Recoverable / शुद्ध वसूली योग्य धनराशि</span>
        <span className="text-base font-semibold text-indigo-700">
          ₹{netRecoverable(gross, recovered, stay).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
        </span>
      </div>

      <Button type="button" onClick={onSaveAndContinue} disabled={!parityOk}>
        {isLastYear ? "Save & View Summary" : "Save & Continue"}
        <i className="ti ti-arrow-right text-base" />
      </Button>
    </div>
  );
}
