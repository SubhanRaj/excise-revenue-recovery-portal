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
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-zinc-700">{label}</span>
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
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500 disabled:bg-zinc-100"
        />
      ) : (
        <Cleave
          value={value}
          disabled={disabled}
          options={{ numeral: true, numeralThousandsGroupStyle: "lakh", numeralDecimalScale: 0 }}
          onChange={(e: CleaveChangeEvent) => onChange(e.target.rawValue)}
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500 disabled:bg-zinc-100"
        />
      )}
    </label>
  );
}
