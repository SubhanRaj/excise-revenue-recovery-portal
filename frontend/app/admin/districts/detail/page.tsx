"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { FINANCIAL_YEARS, PAC_FIELD_ORDER, PAC_FIELD_LABELS, isMoneyField, netRecoverable } from "@/lib/pac-fields";
import { formatIST } from "@/lib/format";
import { getNavDistrictId } from "@/lib/adminNav";
import { useAdminData } from "@/lib/useAdminData";
import AppHeader, { type NavLink } from "@/components/ui/AppHeader";

const NAV_LINKS: NavLink[] = [
  { label: "Dashboard", href: "/admin" },
  { label: "Districts", href: "/admin/districts" },
  { label: "Audit Log", href: "/admin/audit" },
];

function formatValue(field: (typeof PAC_FIELD_ORDER)[number], value: number) {
  return isMoneyField(field)
    ? `₹${value.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`
    : value.toLocaleString("en-IN");
}

// Which district to show comes from sessionStorage (lib/adminNav.ts), set by whatever link
// sent the admin here (a table row, the header's district search, the dashboard's top-5 list)
// — not a ?id= URL query string. This app is a fully static export (next.config.ts:
// output: "export") with no server to resolve arbitrary paths at request time, so a
// /districts/[id] dynamic segment would need every id enumerated via generateStaticParams;
// sessionStorage avoids that without putting the id in the URL either.
export default function DistrictDetailPage() {
  const [districtId, setDistrictId] = useState<number | null>(null);
  const { ready, profile, districts, pacData, sync, syncing, lastSyncedAt } = useAdminData();
  const [query, setQuery] = useState("");

  useEffect(() => {
    setDistrictId(getNavDistrictId());
  }, []);

  const district = districts.find((d) => d.id === districtId);
  const yearRows = useMemo(
    () => FINANCIAL_YEARS.map((fy) => pacData.find((p) => p.districtId === districtId && p.financialYear === fy)),
    [pacData, districtId]
  );
  // All 5 years' rows share the same lock event (one atomic submit), so any row that exists
  // carries the same submittedByName/lockedAt — just read off the first one found.
  const lockInfo = yearRows.find((r) => r);

  // Search across every year's value for a field, on both the raw number and its formatted
  // (₹-prefixed, comma-grouped) form, so "50000" or "50,000" or "₹50,000.00" all match.
  const q = query.trim().toLowerCase();
  const visibleFields = q
    ? PAC_FIELD_ORDER.filter((field) =>
        yearRows.some((row) => {
          const value = row?.[field] ?? 0;
          return String(value).includes(q) || formatValue(field, value).toLowerCase().includes(q);
        })
      )
    : PAC_FIELD_ORDER;

  if (!ready || districtId === null) return null;

  return (
    <div className="flex min-h-full flex-1 flex-col bg-slate-50 dark:bg-slate-950">
      <AppHeader title="District Detail" role="admin" profile={profile} navLinks={NAV_LINKS} onSync={sync} syncing={syncing} lastSyncedAt={lastSyncedAt} districts={districts} />
      <div className="mx-auto w-full max-w-5xl flex-1 px-6 py-6 lg:px-10">
        <Link
          href="/admin/districts"
          className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:underline dark:text-blue-400"
        >
          <i className="ti ti-chevron-left text-base" />
          Back to Districts
        </Link>

        {!district ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            District not found in the local cache — try Sync (top right) and reopen this page.
          </p>
        ) : (
          <>
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{district.districtName}</h1>
                <span
                  className={`mt-1 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    district.lockStatus === 1
                      ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
                      : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                  }`}
                >
                  <i className={`ti ${district.lockStatus === 1 ? "ti-lock" : "ti-lock-open"} text-sm`} />
                  {district.lockStatus === 1 ? "Locked" : "Unlocked"}
                </span>
              </div>
              {lockInfo && (
                <div className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-800 dark:bg-slate-900">
                  <p className="text-slate-500 dark:text-slate-400">
                    Locked by <span className="font-medium text-slate-800 dark:text-slate-200">{lockInfo.submittedByName ?? "—"}</span>
                  </p>
                  <p className="text-slate-500 dark:text-slate-400">
                    on <span className="font-medium text-slate-800 dark:text-slate-200">{formatIST(lockInfo.lockedAt)}</span> IST
                  </p>
                </div>
              )}
              {district.lockStatus === 0 && district.unlockedAt && (
                <div className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-800 dark:bg-slate-900">
                  <p className="text-slate-500 dark:text-slate-400">
                    Last unlocked by{" "}
                    <span className="font-medium text-slate-800 dark:text-slate-200">{district.unlockedBy ?? "—"}</span> on{" "}
                    <span className="font-medium text-slate-800 dark:text-slate-200">{formatIST(district.unlockedAt)}</span> IST
                  </p>
                  {district.unlockReason && (
                    <p className="mt-1 text-slate-500 dark:text-slate-400">
                      Reason: <span className="font-medium text-slate-800 dark:text-slate-200">{district.unlockReason}</span>
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="mb-3">
              <input
                type="text"
                placeholder="Search field or amount..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full max-w-sm rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </div>

            <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800">
                    <th className="whitespace-nowrap px-3 py-2.5 text-left font-medium text-slate-600 dark:text-slate-400">
                      Field
                    </th>
                    {FINANCIAL_YEARS.map((fy) => (
                      <th
                        key={fy}
                        className="whitespace-nowrap px-3 py-2.5 text-left font-medium text-slate-600 dark:text-slate-400"
                      >
                        FY {fy}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleFields.length === 0 ? (
                    <tr>
                      <td colSpan={FINANCIAL_YEARS.length + 1} className="px-3 py-6 text-center text-slate-500 dark:text-slate-400">
                        No fields match &quot;{query}&quot;.
                      </td>
                    </tr>
                  ) : (
                    visibleFields.map((field) => (
                      <tr key={field} className="border-t border-slate-100 bg-white dark:border-slate-800 dark:bg-slate-900">
                        <td className="whitespace-nowrap px-3 py-2.5 font-medium text-slate-700 dark:text-slate-300">
                          {PAC_FIELD_LABELS[field]}
                        </td>
                        {yearRows.map((row, i) => (
                          <td key={FINANCIAL_YEARS[i]} className="whitespace-nowrap px-3 py-2.5 text-slate-800 dark:text-slate-200">
                            {formatValue(field, row?.[field] ?? 0)}
                          </td>
                        ))}
                      </tr>
                    ))
                  )}
                  {!q && (
                    <tr className="border-t-2 border-slate-300 bg-slate-50 font-semibold text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
                      <td className="whitespace-nowrap px-3 py-2.5">Net Recoverable</td>
                      {yearRows.map((row, i) => (
                        <td key={FINANCIAL_YEARS[i]} className="whitespace-nowrap px-3 py-2.5">
                          ₹
                          {netRecoverable(
                            row?.grossArrears ?? 0,
                            row?.recoveredAmount ?? 0,
                            row?.stayAmount ?? 0
                          ).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </td>
                      ))}
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
