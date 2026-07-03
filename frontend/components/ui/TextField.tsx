"use client";

type Props = React.InputHTMLAttributes<HTMLInputElement> & {
  label: string;
};

// ponytail: no icon-in-input decoration — the Tabler webfont's glyphs render via a CSS
// ::before pseudo-element that loads async, so a decorative icon sitting on top of live
// text can briefly show a fallback tofu glyph overlapping it. Not worth fighting for cosmetics.
export default function TextField({ label, className = "", ...props }: Props) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-700">{label}</span>
      <input
        {...props}
        className={`w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition-colors focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 ${className}`}
      />
    </label>
  );
}
