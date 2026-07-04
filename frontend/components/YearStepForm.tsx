"use client";

import PacFieldInput from "./PacFieldInput";
import { PAC_FIELD_LABELS, netRecoverable } from "@/lib/pac-fields";
import type { DraftYear } from "@/lib/db";
import Button from "./ui/Button";
import Banner from "./ui/Banner";
import HelpPanel from "./ui/HelpPanel";

type Props = {
  year: DraftYear;
  onFieldChange: (field: keyof DraftYear, value: string) => void;
  onSaveAndContinue: () => void;
  onBack?: () => void;
  isLastYear: boolean;
  blankErrorMessage: string | null;
};

export default function YearStepForm({
  year,
  onFieldChange,
  onSaveAndContinue,
  onBack,
  isLastYear,
  blankErrorMessage,
}: Props) {
  const gross = Number(year.grossArrears) || 0;
  const recovered = Number(year.recoveredAmount) || 0;
  const stay = Number(year.stayAmount) || 0;
  const rcAmount = Number(year.rcAmount) || 0;

  const parityOk = year.rcAmount === "" || year.recoveredAmount === "" || rcAmount === recovered;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-4">
        <div className="flex items-center gap-2">
          <i className="ti ti-calendar-stats text-xl text-indigo-600" />
          <h2 className="text-base font-semibold text-slate-900">Financial Year {year.financialYear}</h2>
        </div>
        <HelpPanel pageKey="deo-year-entry" title="Filling this form">
          <p>Enter all six PAC/RC fields for this year. None may be left blank — type 0 if there is genuinely no amount, so a blank never gets silently treated as zero.</p>
          <p><strong>Recovered Amount (3)</strong> must exactly equal <strong>RC Amount (2.ii)</strong> — the &quot;Save &amp; Continue&quot; button stays disabled until they match.</p>
          <p><strong>Net Recoverable</strong> updates live as you type; it is calculated for display only and is not stored separately.</p>
        </HelpPanel>
      </div>

      <div className="grid grid-cols-1 gap-4">
        <PacFieldInput
          label={PAC_FIELD_LABELS.grossArrears}
          value={year.grossArrears}
          money
          onChange={(raw) => onFieldChange("grossArrears", raw)}
        />

        <div className="grid grid-cols-[7rem_1fr] gap-3">
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

        <div>
          <PacFieldInput
            label={PAC_FIELD_LABELS.recoveredAmount}
            value={year.recoveredAmount}
            money
            onChange={(raw) => onFieldChange("recoveredAmount", raw)}
          />
          {!parityOk && (
            <p className="mt-1.5 text-sm font-bold text-red-600">
              Recovered Amount (3) must equal RC Amount (2.ii).
            </p>
          )}
        </div>

        <div className="grid grid-cols-[7rem_1fr] gap-3">
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

      {blankErrorMessage && <Banner variant="error">{blankErrorMessage}</Banner>}

      <div className="flex items-center justify-between rounded-lg border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm">
        <span className="font-medium text-indigo-900">Net Recoverable / शुद्ध वसूली योग्य धनराशि</span>
        <span className="text-base font-semibold text-indigo-700">
          ₹{netRecoverable(gross, recovered, stay).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
        </span>
      </div>

      <div className="flex items-center justify-between gap-3">
        {onBack ? (
          <Button type="button" variant="secondary" onClick={onBack}>
            <i className="ti ti-arrow-left text-base" />
            Previous Year
          </Button>
        ) : (
          <span />
        )}
        <Button type="button" onClick={onSaveAndContinue} disabled={!parityOk}>
          {isLastYear ? "Save & View Summary" : "Save & Continue"}
          <i className="ti ti-arrow-right text-base" />
        </Button>
      </div>
    </div>
  );
}
