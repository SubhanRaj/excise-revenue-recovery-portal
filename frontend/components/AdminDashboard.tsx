import { useEffect, useRef } from "react";
import Link from "next/link";
import type { Chart } from "chart.js";
import { FINANCIAL_YEARS, PAC_FIELD_ORDER, PAC_FIELD_LABELS, isMoneyField, netRecoverable } from "@/lib/pac-fields";
import type { CachedDistrict } from "@/lib/db";

type Row = CachedDistrict & Record<(typeof PAC_FIELD_ORDER)[number], number>;

// Every KpiCard/chart/list on this dashboard is a total across the full 5-year window, not one
// FY at a time — see the comment in admin/page.tsx for why a per-year filter didn't make sense
// here. This is just the label for that window.
const PERIOD_LABEL = `FY ${FINANCIAL_YEARS[0]} – ${FINANCIAL_YEARS[FINANCIAL_YEARS.length - 1]}`;

function formatMoney(value: number) {
  return `₹${value.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
}

// Chart.js loads from a CDN <script lazyOnload> (layout.tsx), so it may not be on
// `window` the instant this mounts — poll briefly instead of assuming it's ready.
function LockStatusDonut({ locked, unlocked }: { locked: number; unlocked: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);

  useEffect(() => {
    let cancelled = false;
    let poll: ReturnType<typeof setInterval> | undefined;

    function render() {
      if (!canvasRef.current || cancelled) return;
      chartRef.current?.destroy();
      chartRef.current = new window.Chart(canvasRef.current, {
        type: "doughnut",
        data: {
          labels: ["Locked", "Unlocked"],
          datasets: [{ data: [locked, unlocked], backgroundColor: ["#ef4444", "#10b981"], borderWidth: 0 }],
        },
        options: {
          plugins: { legend: { display: false } },
          cutout: "70%",
          maintainAspectRatio: false,
        },
      });
    }

    if (window.Chart) {
      render();
    } else {
      poll = setInterval(() => {
        if (window.Chart) {
          clearInterval(poll);
          render();
        }
      }, 150);
    }

    return () => {
      cancelled = true;
      if (poll) clearInterval(poll);
      chartRef.current?.destroy();
    };
  }, [locked, unlocked]);

  return (
    <div className="relative h-28 w-28 shrink-0">
      <canvas ref={canvasRef} />
    </div>
  );
}

const KPI_COLORS = {
  blue: {
    card: "border-blue-100 bg-blue-50/60 dark:border-blue-900 dark:bg-blue-950/30",
    badge: "bg-blue-600 text-white",
  },
  red: {
    card: "border-red-100 bg-red-50/60 dark:border-red-900 dark:bg-red-950/30",
    badge: "bg-red-600 text-white",
  },
  emerald: {
    card: "border-emerald-100 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/30",
    badge: "bg-emerald-600 text-white",
  },
  amber: {
    card: "border-amber-100 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/30",
    badge: "bg-amber-500 text-white",
  },
  violet: {
    card: "border-violet-100 bg-violet-50/60 dark:border-violet-900 dark:bg-violet-950/30",
    badge: "bg-violet-600 text-white",
  },
} as const;

function KpiCard({
  label,
  value,
  icon,
  color,
  href,
}: {
  label: string;
  value: string;
  icon: string;
  color: keyof typeof KPI_COLORS;
  href?: string;
}) {
  const c = KPI_COLORS[color];
  const content = (
    <div
      className={`group rounded-lg border p-4 transition-all ${c.card} ${
        href ? "cursor-pointer hover:-translate-y-0.5 hover:shadow-md" : ""
      }`}
    >
      <div className="flex items-center gap-2.5">
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${c.badge}`}>
          <i className={`ti ${icon} text-base`} />
        </span>
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          {label}
        </span>
        {href && (
          <i className="ti ti-chevron-right ml-auto text-slate-300 transition-transform group-hover:translate-x-0.5 dark:text-slate-600" />
        )}
      </div>
      <p className="mt-2 text-xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">{value}</p>
    </div>
  );
  return href ? <Link href={href}>{content}</Link> : content;
}

// ponytail: top-5 list and lock-ratio bar stay plain CSS divs — only the one chart the user
// asked to see (locked vs unlocked, LockStatusDonut above) pulls in Chart.js via CDN.
export default function AdminDashboard({ rows }: { rows: Row[] }) {
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
    .map((r) => ({
      id: r.id,
      name: r.districtName,
      dues: netRecoverable(r.grossArrears, r.recoveredAmount, r.stayAmount),
    }))
    .sort((a, b) => b.dues - a.dues)
    .slice(0, 5);
  const maxDues = Math.max(1, ...topDues.map((d) => d.dues));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <KpiCard label="Districts" value={String(totalDistricts)} icon="ti-map-pin" color="blue" href="/admin/districts" />
        <KpiCard label="Locked" value={String(locked)} icon="ti-lock" color="red" href="/admin/districts?status=locked" />
        <KpiCard
          label="Unlocked"
          value={String(unlocked)}
          icon="ti-lock-open"
          color="emerald"
          href="/admin/districts?status=unlocked"
        />
        <KpiCard label="Gross Arrears" value={formatMoney(sums.grossArrears)} icon="ti-report-money" color="amber" href="/admin/districts" />
        <KpiCard label="Net Recoverable" value={formatMoney(netRecoverableTotal)} icon="ti-cash" color="violet" href="/admin/districts" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <h3 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">
            Top 5 districts by Net Recoverable — Total ({PERIOD_LABEL})
          </h3>
          <div className="space-y-2.5">
            {topDues.map((d) => (
              <Link
                key={d.id}
                href={`/admin/districts/detail?id=${d.id}`}
                className="-mx-2 block rounded-md px-2 py-1 transition-colors hover:bg-blue-50 dark:hover:bg-blue-950/40"
              >
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
              </Link>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <h3 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">Lock status</h3>
          <div className="flex items-center gap-4">
            <LockStatusDonut locked={locked} unlocked={unlocked} />
            <div className="flex-1">
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
            </div>
          </div>

          <h3 className="mb-3 mt-5 text-sm font-semibold text-slate-700 dark:text-slate-300">
            All fields — Total ({PERIOD_LABEL})
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
