"use client";

import { useMemo } from "react";
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

  // A district's lock/PAC submission is all 5 years at once (one atomic submit — see
  // CLAUDE.md), never partial, so there's no such thing as "locked for FY 2023-24 but not
  // 2024-25" — a per-year filter on this overview page was misleading, not just unnecessary.
  // Every field here is summed across all 5 years per district instead, i.e. the cumulative
  // position as of 31 March 2026. Districts/page.tsx keeps its own per-year filter, which is
  // legitimately useful there for inspecting one year's figures per district.
  const rows: Row[] = useMemo(
    () =>
      districts.map((d) => {
        const values = Object.fromEntries(
          PAC_FIELD_ORDER.map((field) => [
            field,
            FINANCIAL_YEARS.reduce((sum, fy) => {
              const match = pacData.find((p) => p.districtId === d.id && p.financialYear === fy);
              return sum + (match?.[field] ?? 0);
            }, 0),
          ])
        ) as Record<(typeof PAC_FIELD_ORDER)[number], number>;
        return { ...d, ...values };
      }),
    [districts, pacData]
  );

  if (!ready) return null;

  return (
    <div className="flex min-h-full flex-1 flex-col bg-slate-50 dark:bg-slate-950">
      <AppHeader title="Admin Dashboard" role="admin" profile={profile} navLinks={NAV_LINKS} onSync={sync} syncing={syncing} districts={districts} />
      <HelpPanel pageKey="admin-dashboard" title="Using this dashboard">
        <p>
          Every stat here is a total across all 5 financial years (FY 2021-22 to 2025-26) —
          districts, locked/unlocked counts, gross arrears, and net recoverable, plus the top 5
          districts by dues.
        </p>
        <p>
          <strong>Sync</strong> (top right) pulls the latest districts and PAC data from the
          server into this browser&apos;s local cache.
        </p>
        <p>
          Go to <strong>Districts</strong> to view/search all 75 districts by a single financial
          year, lock or unlock a submission, export to Excel, or bulk-provision DEO logins via
          the Excel template.
        </p>
      </HelpPanel>
      <div className="mx-auto w-full max-w-[1400px] flex-1 px-6 py-6 lg:px-10">
        {error && (
          <div className="mb-4">
            <Banner variant="error">{error}</Banner>
          </div>
        )}

        <AdminDashboard rows={rows} />
      </div>
    </div>
  );
}
