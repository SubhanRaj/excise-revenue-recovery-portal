"use client";

import { useState } from "react";
import PacFieldInput from "./PacFieldInput";
import { PAC_FIELD_LABELS, OPENING_BALANCE_LABEL, netRecoverableForYear } from "@/lib/pac-fields";
import type { DraftYear } from "@/lib/db";
import Button from "./ui/Button";

const RC_COUNT_ERROR =
  "No. of RCs Issued cannot be 0 when RC Amount is entered / यदि आर.सी. में निहित धनराशि दर्ज " +
  "की गई है तो जारी आर.सी. की संख्या 0 नहीं हो सकती";
const STAY_COUNT_ERROR =
  "No. of Stay Orders cannot be 0 when Stayed Amount is entered / यदि स्थगित धनराशि दर्ज की गई " +
  "है तो स्थगन आदेशों की संख्या 0 नहीं हो सकती";

// Exported so deo-data-entry/page.tsx's saveAndContinue() can block on the same rule.
export function countAmountErrors(year: DraftYear): string[] {
  const errors: string[] = [];
  if ((Number(year.rcAmount) || 0) > 0 && (Number(year.rcCount) || 0) === 0) errors.push(RC_COUNT_ERROR);
  if ((Number(year.stayAmount) || 0) > 0 && (Number(year.stayCount) || 0) === 0) errors.push(STAY_COUNT_ERROR);
  return errors;
}

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

  const [rcTouched, setRcTouched] = useState(false);
  const [stayTouched, setStayTouched] = useState(false);
  const rcCountInvalid = (Number(year.rcAmount) || 0) > 0 && (Number(year.rcCount) || 0) === 0;
  const stayCountInvalid = (Number(year.stayAmount) || 0) > 0 && (Number(year.stayCount) || 0) === 0;

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
        <span className="text-blue-800 dark:text-blue-300">{OPENING_BALANCE_LABEL}</span>
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
            onBlur={() => setRcTouched(true)}
            error={rcTouched && rcCountInvalid ? RC_COUNT_ERROR : undefined}
          />
          <PacFieldInput
            label={PAC_FIELD_LABELS.rcAmount}
            value={year.rcAmount}
            money
            onChange={(raw) => onFieldChange("rcAmount", raw)}
            onBlur={() => setRcTouched(true)}
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
            onBlur={() => setStayTouched(true)}
            error={stayTouched && stayCountInvalid ? STAY_COUNT_ERROR : undefined}
          />
          <PacFieldInput
            label={PAC_FIELD_LABELS.stayAmount}
            value={year.stayAmount}
            money
            onChange={(raw) => onFieldChange("stayAmount", raw)}
            onBlur={() => setStayTouched(true)}
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
