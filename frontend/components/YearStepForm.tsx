"use client";

import PacFieldInput from "./PacFieldInput";
import { PAC_FIELD_ORDER, PAC_FIELD_LABELS, isMoneyField, netRecoverable } from "@/lib/pac-fields";
import type { DraftYear } from "@/lib/db";

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
    <div className="space-y-4">
      <h2 className="text-base font-semibold text-zinc-900">वित्तीय वर्ष {year.financialYear}</h2>

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
        <p className="text-sm font-medium text-red-600">
          वसूल की गयी धनराशि (3), आर.सी. में निहित धनराशि (2.ii) के बराबर होनी चाहिए।
        </p>
      )}

      <div className="rounded-md border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm">
        <span className="font-medium text-zinc-700">शुद्ध वसूली योग्य धनराशि (Net Recoverable): </span>
        <span className="font-semibold text-zinc-900">
          ₹{netRecoverable(gross, recovered, stay).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
        </span>
      </div>

      <button
        type="button"
        onClick={onSaveAndContinue}
        disabled={!parityOk}
        className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {isLastYear ? "सहेजें और सारांश देखें" : "सहेजें और आगे बढ़ें"}
      </button>
    </div>
  );
}
