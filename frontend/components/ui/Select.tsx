"use client";

type Props = React.SelectHTMLAttributes<HTMLSelectElement>;

// Native <select> arrows vary in size/position across browsers and don't scale with the rest
// of the toolbar's icons — appearance-none plus our own Tabler chevron keeps every dropdown
// visually identical (and matching Button.tsx's forced icon sizing) instead of each browser's
// own bulky default arrow eating extra padding. One text-sm size for every admin dropdown —
// these used to mix text-xs (status/event filters) and text-sm (FY/rows-per-page filters)
// sitting side by side in the same toolbar row, which is what made them look mismatched.
export default function Select({ className = "", ...props }: Props) {
  return (
    <div className="relative inline-block">
      {/* min-w-[8rem]: with appearance-none + border-box (Tailwind's preflight), browsers'
          shrink-to-fit width for a bare <select> doesn't reliably leave room for our own pr-9
          padding — the option text can render right under the chevron icon instead of the
          box growing to fit both. A floor width sidesteps that instead of relying on the
          browser to size around our padding correctly. */}
      <select
        {...props}
        className={`min-w-[8rem] appearance-none rounded-md border border-slate-300 bg-white py-1.5 pl-3 pr-9 text-sm text-slate-700 shadow-sm outline-none hover:bg-slate-50 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 ${className}`}
      />
      <i className="ti ti-chevron-down pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-500 dark:text-slate-400" />
    </div>
  );
}
