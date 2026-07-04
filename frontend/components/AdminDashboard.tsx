import { PAC_FIELD_ORDER, PAC_FIELD_LABELS, isMoneyField, netRecoverable } from "@/lib/pac-fields";
import type { CachedDistrict } from "@/lib/db";

type Row = CachedDistrict & Record<(typeof PAC_FIELD_ORDER)[number], number>;

function formatMoney(value: number) {
  return `₹${value.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
}

function KpiCard({ label, value, icon }: { label: string; value: string; icon: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
        <i className={`ti ${icon} text-base`} />
        <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
      </div>
      <p className="mt-1.5 text-xl font-semibold text-slate-900 dark:text-slate-100">{value}</p>
    </div>
  );
}

// ponytail: plain divs/percentages instead of a charting library — a bar list and a stacked
// progress bar cover "some stats at a glance" without a new dependency. Swap in Chart.js (or
// similar) later if the KPI cards stop being enough.
export default function AdminDashboard({ rows, selectedYear }: { rows: Row[]; selectedYear: string }) {
  const totalDistricts = rows.length;
  const locked = rows.filter((r) => r.lockStatus === 1).length;
  const unlocked = totalDistricts - locked;

  const sums = Object.fromEntries(
    PAC_FIELD_ORDER.map((field) => [field, rows.reduce((sum, r) => sum + r[field], 0)])
  ) as Record<(typeof PAC_FIELD_ORDER)[number], number>;
  const netRecoverableTotal = rows.reduce(
    (sum, r) => sum + netRecoverable(r.grossArrears, r.recoveredAmount, r.stayAmount),
    0
  );

  const topDues = [...rows]
    .map((r) => ({ name: r.districtName, dues: netRecoverable(r.grossArrears, r.recoveredAmount, r.stayAmount) }))
    .sort((a, b) => b.dues - a.dues)
    .slice(0, 5);
  const maxDues = Math.max(1, ...topDues.map((d) => d.dues));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <KpiCard label="Districts" value={String(totalDistricts)} icon="ti-map-pin" />
        <KpiCard label="Locked" value={String(locked)} icon="ti-lock" />
        <KpiCard label="Unlocked" value={String(unlocked)} icon="ti-lock-open" />
        <KpiCard label="Gross Arrears" value={formatMoney(sums.grossArrears)} icon="ti-report-money" />
        <KpiCard label="Net Recoverable" value={formatMoney(netRecoverableTotal)} icon="ti-cash" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <h3 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">
            Top 5 districts by Net Recoverable — {selectedYear}
          </h3>
          <div className="space-y-2.5">
            {topDues.map((d) => (
              <div key={d.name}>
                <div className="mb-1 flex items-center justify-between text-xs text-slate-600 dark:text-slate-400">
                  <span>{d.name}</span>
                  <span className="tabular-nums">{formatMoney(d.dues)}</span>
                </div>
                <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800">
                  <div
                    className="h-2 rounded-full bg-blue-600"
                    style={{ width: `${Math.max(2, (d.dues / maxDues) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <h3 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">Lock status — {selectedYear}</h3>
          <div className="flex h-3 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <div className="bg-red-500" style={{ width: `${(locked / Math.max(1, totalDistricts)) * 100}%` }} />
            <div
              className="bg-emerald-500"
              style={{ width: `${(unlocked / Math.max(1, totalDistricts)) * 100}%` }}
            />
          </div>
          <div className="mt-3 flex gap-5 text-xs text-slate-600 dark:text-slate-400">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-red-500" /> Locked ({locked})
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500" /> Unlocked ({unlocked})
            </span>
          </div>

          <h3 className="mb-3 mt-5 text-sm font-semibold text-slate-700 dark:text-slate-300">
            All fields — {selectedYear} total
          </h3>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            {PAC_FIELD_ORDER.map((field) => (
              <div key={field} className="flex items-center justify-between gap-2">
                <dt className="truncate text-slate-500 dark:text-slate-400" title={PAC_FIELD_LABELS[field]}>
                  {PAC_FIELD_LABELS[field].split(" / ")[0]}
                </dt>
                <dd className="tabular-nums font-medium text-slate-900 dark:text-slate-100">
                  {isMoneyField(field) ? formatMoney(sums[field]) : sums[field].toLocaleString("en-IN")}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </div>
  );
}
