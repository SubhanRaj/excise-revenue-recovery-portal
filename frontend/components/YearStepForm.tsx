"use client";

import PacFieldInput from "./PacFieldInput";
import { PAC_FIELD_LABELS, netRecoverableForYear } from "@/lib/pac-fields";
import type { DraftYear } from "@/lib/db";
import Button from "./ui/Button";

type Props = {
  year: DraftYear;
  // The previous FY's netRecoverable (0 for the first FY) — see CLAUDE.md's Data model section.
  openingBalance: number;
  onFieldChange: (field: keyof DraftYear, value: string) => void;
  onSaveAndContinue: () => void;
  onBack?: () => void;
  onClear: () => void;
  isLastYear: boolean;
};

export default function YearStepForm({ year, openingBalance, onFieldChange, onSaveAndContinue, onBack, onClear, isLastYear }: Props) {
  const gross = Number(year.grossArrears) || 0;
  const recovered = Number(year.recoveredAmount) || 0;
  const stay = Number(year.stayAmount) || 0;
  const { netRecoverable } = netRecoverableForYear(gross, recovered, stay, openingBalance);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-4 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <i className="ti ti-calendar-stats text-xl text-blue-600 dark:text-blue-400" />
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            FY {year.financialYear}
          </h2>
        </div>
        <Button type="button" variant="dangerSoft" size="xs" onClick={onClear}>
          <i className="ti ti-eraser text-sm" />
          Clear
        </Button>
      </div>

      <div className="flex items-center justify-between rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm dark:border-blue-900 dark:bg-blue-950/40">
        <span className="text-blue-800 dark:text-blue-300">
          Opening Balance / प्रारंभिक शेष धनराशि
        </span>
        <span className="tabular-nums text-blue-700 dark:text-blue-300">
          ₹{openingBalance.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4">
        <PacFieldInput
          label={PAC_FIELD_LABELS.grossArrears}
          value={year.grossArrears}
          money
          onChange={(raw) => onFieldChange("grossArrears", raw)}
        />

        <div className="grid grid-cols-1 sm:grid-cols-[16rem_1fr] lg:grid-cols-[26rem_1fr] gap-4 sm:items-end">
          <PacFieldInput
            label={PAC_FIELD_LABELS.rcCount}
            value={year.rcCount}
            money={false}
            onChange={(raw) => onFieldChange("rcCount", raw)}
          />
          <PacFieldInput
            label={PAC_FIELD_LABELS.rcAmount}
            value={year.rcAmount}
            money
            onChange={(raw) => onFieldChange("rcAmount", raw)}
          />
        </div>

        <PacFieldInput
          label={PAC_FIELD_LABELS.recoveredAmount}
          value={year.recoveredAmount}
          money
          onChange={(raw) => onFieldChange("recoveredAmount", raw)}
        />

        <div className="grid grid-cols-1 sm:grid-cols-[16rem_1fr] lg:grid-cols-[26rem_1fr] gap-4 sm:items-end">
          <PacFieldInput
            label={PAC_FIELD_LABELS.stayCount}
            value={year.stayCount}
            money={false}
            onChange={(raw) => onFieldChange("stayCount", raw)}
          />
          <PacFieldInput
            label={PAC_FIELD_LABELS.stayAmount}
            value={year.stayAmount}
            money
            onChange={(raw) => onFieldChange("stayAmount", raw)}
          />
        </div>
      </div>

      <div className="flex items-center justify-between rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm dark:border-blue-900 dark:bg-blue-950/40">
        <span className="font-medium text-blue-900 dark:text-blue-200">
          Net Recoverable / शुद्ध वसूली योग्य धनराशि
        </span>
        <span className="text-base font-semibold text-blue-700 dark:text-blue-300">
          ₹{netRecoverable.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
        </span>
      </div>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        {onBack ? (
          <Button type="button" variant="secondary" onClick={onBack} className="w-full sm:w-auto">
            <i className="ti ti-arrow-left text-base" />
            Previous Year
          </Button>
        ) : (
          <span className="hidden sm:inline" />
        )}
        <Button type="button" onClick={onSaveAndContinue} className="w-full sm:w-auto">
          {isLastYear ? "Save & View Summary" : "Save & Continue"}
          <i className="ti ti-arrow-right text-base" />
        </Button>
      </div>
    </div>
  );
}
