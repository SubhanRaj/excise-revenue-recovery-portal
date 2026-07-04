"use client";

import { useState } from "react";
import PacFieldInput from "./PacFieldInput";
import { PAC_FIELD_LABELS, netRecoverable } from "@/lib/pac-fields";
import type { DraftYear } from "@/lib/db";
import Button from "./ui/Button";

// Full field names without the leading "3."/"2. (ii)" form-numbering — the numbers make
// sense next to the input itself, but read as cryptic column references in a standalone
// error message.
const RECOVERED_AMOUNT_NAME = "Recovered Amount / वसूल की गयी धनराशि";
const RC_AMOUNT_NAME = "RC Amount / आर.सी. में निहित धनराशि";

type Props = {
  year: DraftYear;
  onFieldChange: (field: keyof DraftYear, value: string) => void;
  onSaveAndContinue: () => void;
  onBack?: () => void;
  isLastYear: boolean;
};

export default function YearStepForm({ year, onFieldChange, onSaveAndContinue, onBack, isLastYear }: Props) {
  const gross = Number(year.grossArrears) || 0;
  const recovered = Number(year.recoveredAmount) || 0;
  const stay = Number(year.stayAmount) || 0;
  const rcAmount = Number(year.rcAmount) || 0;

  const parityOk = year.rcAmount === "" || year.recoveredAmount === "" || rcAmount === recovered;

  // Recovered Amount auto-fills from RC Amount until the DEO edits it directly — once they
  // do, it stops following (still just a normal editable field, not locked).
  const [followRc, setFollowRc] = useState(year.recoveredAmount === "" || year.recoveredAmount === year.rcAmount);
  // Parity error only shows after the DEO leaves one of the two fields, not on every keystroke.
  const [parityTouched, setParityTouched] = useState(false);

  function handleRcAmountChange(raw: string) {
    onFieldChange("rcAmount", raw);
    if (followRc) onFieldChange("recoveredAmount", raw);
  }

  function handleRecoveredAmountChange(raw: string) {
    onFieldChange("recoveredAmount", raw);
    setFollowRc(false);
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 border-b border-slate-100 pb-4">
        <i className="ti ti-calendar-stats text-xl text-indigo-600" />
        <h2 className="text-base font-semibold text-slate-900">Financial Year {year.financialYear}</h2>
      </div>

      <div className="grid grid-cols-1 gap-4">
        <PacFieldInput
          label={PAC_FIELD_LABELS.grossArrears}
          value={year.grossArrears}
          money
          onChange={(raw) => onFieldChange("grossArrears", raw)}
        />

        <div className="grid grid-cols-[11rem_1fr] gap-4 items-end">
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
            onChange={handleRcAmountChange}
            onBlur={() => setParityTouched(true)}
          />
        </div>

        <div>
          <PacFieldInput
            label={PAC_FIELD_LABELS.recoveredAmount}
            value={year.recoveredAmount}
            money
            onChange={handleRecoveredAmountChange}
            onBlur={() => setParityTouched(true)}
          />
          {parityTouched && !parityOk && (
            <p className="mt-1.5 text-sm font-bold text-red-600">
              {RECOVERED_AMOUNT_NAME} must exactly match {RC_AMOUNT_NAME} — please correct one
              of the two amounts before continuing.
              <br />
              {RECOVERED_AMOUNT_NAME.split(" / ")[1]} और {RC_AMOUNT_NAME.split(" / ")[1]} बिल्कुल
              समान होनी चाहिए — आगे बढ़ने से पहले किसी एक राशि को ठीक करें।
            </p>
          )}
        </div>

        <div className="grid grid-cols-[11rem_1fr] gap-4 items-end">
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
