"use client";

type Props = React.InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  icon?: string; // Tabler icon class suffix, e.g. "ti-device-mobile"
};

export default function TextField({ label, icon, className = "", ...props }: Props) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-700">{label}</span>
      <span className="relative flex items-center">
        {icon && <i className={`ti ${icon} pointer-events-none absolute left-3 text-lg text-slate-400`} />}
        <input
          {...props}
          className={`w-full rounded-md border border-slate-300 bg-white py-2.5 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition-colors focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 ${icon ? "pl-10 pr-3" : "px-3"} ${className}`}
        />
      </span>
    </label>
  );
}
