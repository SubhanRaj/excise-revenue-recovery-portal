"use client";

import Cleave from "cleave.js/react";

type CleaveChangeEvent = React.ChangeEvent<HTMLInputElement> & { target: { rawValue: string } };

type Props = {
  label: string;
  value: string;
  onChange: (raw: string) => void;
  money: boolean;
  disabled?: boolean;
};

// Indian numeral grouping (Lakh/Crore) with a ₹ prefix for money fields, via Cleave.js —
// native `numeralThousandsGroupStyle: "lakh"` support, no custom formatting logic needed.
export default function PacFieldInput({ label, value, onChange, money, disabled }: Props) {
  const inputClass =
    "w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition-colors focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-100";

  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-700">{label}</span>
      {money ? (
        <Cleave
          value={value}
          disabled={disabled}
          options={{
            numeral: true,
            numeralThousandsGroupStyle: "lakh",
            numeralDecimalScale: 2,
            prefix: "₹",
            rawValueTrimPrefix: true,
          }}
          onChange={(e: CleaveChangeEvent) => onChange(e.target.rawValue)}
          className={inputClass}
        />
      ) : (
        <Cleave
          value={value}
          disabled={disabled}
          options={{ numeral: true, numeralThousandsGroupStyle: "lakh", numeralDecimalScale: 0 }}
          onChange={(e: CleaveChangeEvent) => onChange(e.target.rawValue)}
          className={inputClass}
        />
      )}
    </label>
  );
}
