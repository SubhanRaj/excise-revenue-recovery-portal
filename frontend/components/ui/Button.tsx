"use client";

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger";
};

const VARIANTS: Record<NonNullable<Props["variant"]>, string> = {
  primary: "bg-indigo-600 text-white hover:bg-indigo-700 focus-visible:ring-indigo-300",
  secondary: "bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 focus-visible:ring-slate-300",
  danger: "bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-300",
};

export default function Button({ variant = "primary", className = "", disabled, ...props }: Props) {
  return (
    <button
      {...props}
      disabled={disabled}
      // ponytail: Tailwind's preflight sets `button { cursor: pointer }` unconditionally in
      // this version, which beats the disabled:cursor-not-allowed utility — so the cursor is
      // set directly from the disabled prop instead of relying on the :disabled variant.
      style={disabled ? { cursor: "not-allowed" } : undefined}
      className={`inline-flex items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-semibold shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 ${VARIANTS[variant]} ${className}`}
    />
  );
}
