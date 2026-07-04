"use client";

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger";
  size?: "md" | "lg";
};

const VARIANTS: Record<NonNullable<Props["variant"]>, string> = {
  primary: "bg-indigo-600 text-white hover:bg-indigo-700 focus-visible:ring-indigo-300",
  secondary: "bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 focus-visible:ring-slate-300",
  danger: "bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-300",
};

// Kept out of the base class string and off the `className` override path deliberately —
// two conflicting Tailwind utilities for the same CSS property (e.g. `py-2.5` from here and
// a `py-4` passed via `className`) both landing in one class list has unreliable precedence,
// since the Tailwind CDN's JIT scans the whole document rather than respecting className
// prop order. A `size` variant avoids ever having two padding/text-size utilities in play.
const SIZES: Record<NonNullable<Props["size"]>, string> = {
  md: "px-4 py-2.5 text-sm",
  lg: "px-6 py-4 text-base",
};

export default function Button({ variant = "primary", size = "md", className = "", disabled, ...props }: Props) {
  return (
    <button
      {...props}
      disabled={disabled}
      // ponytail: Tailwind's preflight sets `button { cursor: pointer }` unconditionally in
      // this version, which beats the disabled:cursor-not-allowed utility — so the cursor is
      // set directly from the disabled prop instead of relying on the :disabled variant.
      style={disabled ? { cursor: "not-allowed" } : undefined}
      className={`inline-flex items-center justify-center gap-2 rounded-md font-semibold shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 ${SIZES[size]} ${VARIANTS[variant]} ${className}`}
    />
  );
}
