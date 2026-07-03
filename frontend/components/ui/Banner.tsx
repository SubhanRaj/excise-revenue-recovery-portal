"use client";

type Props = {
  variant: "error" | "success";
  children: React.ReactNode;
};

const VARIANTS = {
  error: { wrap: "bg-red-50 text-red-700 border-red-100", icon: "ti-alert-circle" },
  success: { wrap: "bg-emerald-50 text-emerald-700 border-emerald-100", icon: "ti-circle-check" },
};

// Inline SPA-state feedback instead of a SweetAlert popup for every message — reserve the
// modal confirm dialog for actual irreversible actions (final submit), not transient errors.
export default function Banner({ variant, children }: Props) {
  const v = VARIANTS[variant];
  return (
    <div className={`flex items-start gap-2 rounded-md border px-3 py-2.5 text-sm font-medium ${v.wrap}`}>
      <i className={`ti ${v.icon} mt-0.5 text-base`} />
      <span>{children}</span>
    </div>
  );
}
