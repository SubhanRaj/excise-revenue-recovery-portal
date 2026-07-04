"use client";

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "dark" | "danger";
  size?: "sm" | "md" | "lg";
};

const VARIANTS: Record<NonNullable<Props["variant"]>, string> = {
  primary: "bg-blue-700 text-white hover:bg-blue-800 focus-visible:ring-blue-300 dark:bg-blue-600 dark:hover:bg-blue-500",
  secondary:
    "bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 focus-visible:ring-slate-300 " +
    "dark:bg-slate-900 dark:text-slate-300 dark:border-slate-700 dark:hover:bg-slate-800",
  // For serious-but-not-alarming actions (e.g. the final lock) — conveys gravity without the
  // "something is wrong" connotation a red button carries.
  dark: "bg-slate-800 text-white hover:bg-slate-900 focus-visible:ring-slate-400 dark:bg-slate-700 dark:hover:bg-slate-600",
  danger: "bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-300",
};

// Kept out of the base class string and off the `className` override path deliberately —
// two conflicting Tailwind utilities for the same CSS property (e.g. `py-2.5` from here and
// a `py-4` passed via `className`) both landing in one class list has unreliable precedence,
// since the Tailwind CDN's JIT scans the whole document rather than respecting className
// prop order. A `size` variant avoids ever having two padding/text-size utilities in play.
const SIZES: Record<NonNullable<Props["size"]>, string> = {
  sm: "px-2.5 py-1.5 text-xs",
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
      // flex-row + whitespace-nowrap spelled out explicitly (not left to inline-flex's
      // default) so icon+label can never wrap onto separate lines regardless of button width.
      className={`inline-flex flex-row flex-nowrap items-center justify-center gap-2 whitespace-nowrap rounded-md font-semibold shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 ${SIZES[size]} ${VARIANTS[variant]} ${className}`}
    />
  );
}
