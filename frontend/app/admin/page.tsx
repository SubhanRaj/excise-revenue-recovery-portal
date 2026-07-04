"use client";

import { useMemo, useState } from "react";
import { FINANCIAL_YEARS, PAC_FIELD_ORDER } from "@/lib/pac-fields";
import { useAdminData } from "@/lib/useAdminData";
import type { CachedDistrict } from "@/lib/db";
import AppHeader, { type NavLink } from "@/components/ui/AppHeader";
import Banner from "@/components/ui/Banner";
import HelpPanel from "@/components/ui/HelpPanel";
import AdminDashboard from "@/components/AdminDashboard";

const NAV_LINKS: NavLink[] = [
  { label: "Dashboard", href: "/admin" },
  { label: "Districts", href: "/admin/districts" },
  { label: "Audit Log", href: "/admin/audit" },
];

type Row = CachedDistrict & Record<(typeof PAC_FIELD_ORDER)[number], number>;

export default function AdminDashboardPage() {
  const { ready, profile, districts, pacData, sync, syncing, error } = useAdminData();
  const [selectedYear, setSelectedYear] = useState<(typeof FINANCIAL_YEARS)[number]>(FINANCIAL_YEARS[0]);

  const rows: Row[] = useMemo(
    () =>
      districts.map((d) => {
        const match = pacData.find((p) => p.districtId === d.id && p.financialYear === selectedYear);
        const values = Object.fromEntries(
          PAC_FIELD_ORDER.map((field) => [field, match?.[field] ?? 0])
        ) as Record<(typeof PAC_FIELD_ORDER)[number], number>;
        return { ...d, ...values };
      }),
    [districts, pacData, selectedYear]
  );

  if (!ready) return null;

  return (
    <div className="flex min-h-full flex-1 flex-col bg-slate-50 dark:bg-slate-950">
      <AppHeader title="Admin Dashboard" role="admin" profile={profile} navLinks={NAV_LINKS} onSync={sync} syncing={syncing} districts={districts} />
      <HelpPanel pageKey="admin-dashboard" title="Using this dashboard">
        <p>
          Pick a financial year to see stats for just that year — districts, locked/unlocked
          counts, gross arrears, and net recoverable, plus the top 5 districts by dues.
        </p>
        <p>
          <strong>Sync</strong> (top right) pulls the latest districts and PAC data from the
          server into this browser&apos;s local cache.
        </p>
        <p>
          Go to <strong>Districts</strong> to view/search all 75 districts, lock or unlock a
          submission, export to Excel, or bulk-provision DEO logins via the Excel template.
        </p>
      </HelpPanel>
      <div className="mx-auto w-full max-w-[1400px] flex-1 px-6 py-6 lg:px-10">
        {error && (
          <div className="mb-4">
            <Banner variant="error">{error}</Banner>
          </div>
        )}

        <div className="mb-4 flex items-center justify-end">
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(e.target.value as (typeof FINANCIAL_YEARS)[number])}
            className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
          >
            {FINANCIAL_YEARS.map((fy) => (
              <option key={fy} value={fy}>
                {fy}
              </option>
            ))}
          </select>
        </div>

        <AdminDashboard rows={rows} selectedYear={selectedYear} />
      </div>
    </div>
  );
}
