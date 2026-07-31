"use client";

import { useState } from "react";
import Cleave from "cleave.js/react";
import PacFieldInput from "./PacFieldInput";
import Select from "./ui/Select";
import {
  PAC_FIELD_LABELS,
  OPENING_BALANCE_LABEL,
  RC_NUMBER_MAX_LENGTH,
  netRecoverableForYear,
  validateRcDetails,
} from "@/lib/pac-fields";
import type { DraftYear, DraftRcDetail } from "@/lib/client-db";
import Button from "./ui/Button";

type CleaveChangeEvent = React.ChangeEvent<HTMLInputElement> & { target: { rawValue: string } };

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

// Exported so deo-data-entry/page.tsx's saveAndContinue() can block on the same rule — calls
// the zero-trust @/lib/pac-fields.ts validator (row count + per-entry blanks + running total),
// converting DraftRcDetail's raw string amounts to numbers first.
export function rcDetailsError(year: DraftYear): string | null {
  const rcCount = Number(year.rcCount) || 0;
  if (rcCount === 0) return null;
  const rcAmount = Number(year.rcAmount) || 0;
  const details = (year.rcDetails ?? []).map((d) => ({
    rcNumber: d.rcNumber,
    rcAmount: Number(d.rcAmount) || 0,
    stayed: d.stayed,
  }));
  return validateRcDetails(rcCount, rcAmount, details);
}

// Keeps the RC Details row count in sync with rcCount as the DEO edits it — growing appends
// blank rows, shrinking truncates trailing rows. No confirm dialog: this is a small in-form
// edit, not a top-level destructive action like Clear/Clear All (which do get one). Exported so
// deo-data-entry/page.tsx's updateField() can call it the moment rcCount changes.
export function syncRcDetailsToCount(rcDetails: DraftRcDetail[], rcCount: number): DraftRcDetail[] {
  const count = Math.max(0, rcCount);
  if (rcDetails.length === count) return rcDetails;
  if (rcDetails.length > count) return rcDetails.slice(0, count);
  return [
    ...rcDetails,
    ...Array.from({ length: count - rcDetails.length }, () => ({ rcNumber: "", rcAmount: "", stayed: false })),
  ];
}

type Props = {
  year: DraftYear;
  // The previous FY's netRecoverable (0 for the first FY) — see CLAUDE.md's Data model section.
  openingBalance: number;
  onFieldChange: (field: keyof DraftYear, value: string) => void;
  onRcDetailChange: (index: number, field: keyof DraftRcDetail, value: string | boolean) => void;
  onSaveAndContinue: () => void;
  onBack?: () => void;
  onClear: () => void;
  isLastYear: boolean;
};

export default function YearStepForm({
  year,
  openingBalance,
  onFieldChange,
  onRcDetailChange,
  onSaveAndContinue,
  onBack,
  onClear,
  isLastYear,
}: Props) {
  const gross = Number(year.grossArrears) || 0;
  const recovered = Number(year.recoveredAmount) || 0;
  const stay = Number(year.stayAmount) || 0;
  const { netRecoverable } = netRecoverableForYear(gross, recovered, stay, openingBalance);

  const [rcTouched, setRcTouched] = useState(false);
  const [stayTouched, setStayTouched] = useState(false);
  const [rcDetailsOpen, setRcDetailsOpen] = useState(true);
  const [rcDetailsTouched, setRcDetailsTouched] = useState(false);
  const rcCountInvalid = (Number(year.rcAmount) || 0) > 0 && (Number(year.rcCount) || 0) === 0;
  const stayCountInvalid = (Number(year.stayAmount) || 0) > 0 && (Number(year.stayCount) || 0) === 0;

  const rcDetails = year.rcDetails ?? [];
  const rcCount = Number(year.rcCount) || 0;
  const rcAmountTotal = Number(year.rcAmount) || 0;
  const rcDetailsSum = rcDetails.reduce((s, d) => s + (Number(d.rcAmount) || 0), 0);
  const rcDetailsMismatch = rcCount > 0 && Math.abs(rcDetailsSum - rcAmountTotal) > 0.01;

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

        {rcCount > 0 && (
          <div className="rounded-lg border border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setRcDetailsOpen((v) => !v)}
              className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left text-sm font-medium text-slate-700 dark:text-slate-300"
            >
              <span className="flex items-center gap-1.5">
                <i className="ti ti-list-details text-base text-blue-600 dark:text-blue-400" />
                RC Details ({rcCount})
              </span>
              <i className={`ti text-base ${rcDetailsOpen ? "ti-chevron-up" : "ti-chevron-down"}`} />
            </button>
            {rcDetailsOpen && (
              <div className="border-t border-slate-200 p-4 dark:border-slate-800">
                {/* table-fixed (not the auto-layout CLAUDE.md otherwise requires for money
                    tables) is fine here: every cell holds an input, not raw money text, so
                    there's nothing for a crore-scale value to clip — the input just scrolls
                    its own content if needed. RC Number/RC Amount get equal width instead of
                    RC Number eating all the leftover space under auto-layout. */}
                <div className="overflow-x-auto">
                  <table className="w-full table-fixed border-collapse text-sm">
                    <thead>
                      <tr className="text-left text-xs font-semibold text-slate-600 dark:text-slate-400">
                        <th className="w-8 py-1.5 pr-2">#</th>
                        <th className="w-[34%] py-1.5 pr-2">RC Number</th>
                        <th className="w-[34%] py-1.5 pr-2">RC Amount</th>
                        <th className="w-32 py-1.5 text-center">
                          <span className="block text-[10px] leading-tight font-semibold text-slate-700 dark:text-slate-300">
                            Stayed by Court?
                          </span>
                          <span
                            className="mt-0.5 block text-xs leading-normal normal-case text-slate-700 dark:text-slate-300"
                            lang="hi"
                          >
                            सक्षम न्यायालय द्वारा स्थगित?
                          </span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {Array.from({ length: rcCount }, (_, i) => rcDetails[i] ?? { rcNumber: "", rcAmount: "", stayed: false }).map(
                        (detail, i) => (
                          <tr key={i} className="border-t border-slate-100 dark:border-slate-800">
                            <td className="py-1.5 pr-2 tabular-nums text-slate-600 dark:text-slate-400">{i + 1}</td>
                            <td className="py-1.5 pr-2">
                              <input
                                type="text"
                                maxLength={RC_NUMBER_MAX_LENGTH}
                                placeholder="RC Number"
                                value={detail.rcNumber}
                                onChange={(e) => onRcDetailChange(i, "rcNumber", e.target.value)}
                                onBlur={() => setRcDetailsTouched(true)}
                                className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-blue-900"
                              />
                            </td>
                            <td className="py-1.5 pr-2">
                              <Cleave
                                value={detail.rcAmount}
                                onBlur={() => setRcDetailsTouched(true)}
                                options={{
                                  numeral: true,
                                  numeralThousandsGroupStyle: "lakh",
                                  numeralDecimalScale: 2,
                                  prefix: "₹",
                                  rawValueTrimPrefix: true,
                                }}
                                onChange={(e: CleaveChangeEvent) => onRcDetailChange(i, "rcAmount", e.target.rawValue)}
                                className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-blue-900"
                              />
                            </td>
                            <td className="py-1.5">
                              <Select
                                size="md"
                                value={detail.stayed ? "yes" : "no"}
                                onChange={(e) => onRcDetailChange(i, "stayed", e.target.value === "yes")}
                                className="w-full min-w-0"
                              >
                                <option value="no">No / नहीं</option>
                                <option value="yes">Yes / हाँ</option>
                              </Select>
                            </td>
                          </tr>
                        )
                      )}
                    </tbody>
                  </table>
                </div>
                <div
                  className={`mt-3 flex items-center justify-between text-xs ${
                    rcDetailsTouched && rcDetailsMismatch
                      ? "font-bold text-red-600 dark:text-red-400"
                      : "text-slate-600 dark:text-slate-400"
                  }`}
                >
                  <span>
                    Entered: ₹{rcDetailsSum.toLocaleString("en-IN", { minimumFractionDigits: 2 })} / Required: ₹
                    {rcAmountTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </span>
                </div>
                {rcDetailsTouched && rcDetailsMismatch && (
                  <p className="mt-1 text-xs font-bold text-red-600 dark:text-red-400" lang="hi">
                    आर.सी. विवरण की कुल राशि, आर.सी. राशि के बराबर होनी चाहिए।
                  </p>
                )}
              </div>
            )}
          </div>
        )}

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
