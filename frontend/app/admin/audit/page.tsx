"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/api";
import { clearClientSession, consumeJustAuthed } from "@/lib/session";
import { notifyToast } from "@/lib/alerts";
import { formatIST } from "@/lib/format";
import AppHeader, { type NavLink } from "@/components/ui/AppHeader";
import Banner from "@/components/ui/Banner";
import HelpPanel from "@/components/ui/HelpPanel";
import type { Profile } from "@/components/ui/ProfileMenu";

const NAV_LINKS: NavLink[] = [
  { label: "Dashboard", href: "/admin" },
  { label: "Districts", href: "/admin/districts" },
  { label: "Audit Log", href: "/admin/audit" },
];

type AuditRow = {
  id: number;
  eventType: string;
  actorRole: "admin" | "deo" | null;
  actorEmail: string | null;
  districtName: string | null;
  metadata: string | null;
  createdAt: string;
};

const EVENT_LABELS: Record<string, string> = {
  login_cug: "DEO login (CUG)",
  login_magic_link: "Login (magic link)",
  logout: "Logout",
  district_locked: "District locked",
  district_unlocked: "District unlocked",
  deo_provisioned: "DEO(s) provisioned",
};

function describeMetadata(row: AuditRow): string {
  if (!row.metadata) return "—";
  try {
    const m = JSON.parse(row.metadata) as Record<string, unknown>;
    return Object.entries(m)
      .map(([k, v]) => `${k}: ${v}`)
      .join(", ");
  } catch {
    return row.metadata;
  }
}

export default function AuditLogPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [eventSort, setEventSort] = useState<"asc" | "desc" | null>(null);

  // Sorts only the currently-loaded page's rows — the log is server-paginated, so a true
  // global sort would need a server-side ORDER BY; not worth it for a 30-day-retention table.
  const sortedRows = useMemo(() => {
    if (!eventSort) return rows;
    const dir = eventSort === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const la = EVENT_LABELS[a.eventType] ?? a.eventType;
      const lb = EVENT_LABELS[b.eventType] ?? b.eventType;
      return dir * la.localeCompare(lb);
    });
  }, [rows, eventSort]);

  async function loadPage(p: number) {
    setLoading(true);
    try {
      const res = await apiFetch<{ rows: AuditRow[]; page: number; pageSize: number }>(
        `/api/admin/audit-log?page=${p}`
      );
      setRows(res.rows);
      setPage(res.page);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load audit log.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    (async () => {
      try {
        const p = await apiFetch<Profile>("/api/auth/me?role=admin");
        setProfile(p);
        if (consumeJustAuthed()) {
          notifyToast({ icon: "success", title: `Welcome, ${p.email ?? "Admin"}` });
        }
      } catch {
        clearClientSession();
        router.replace("/login");
        return;
      }
      setReady(true);
      await loadPage(1);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  if (!ready) return null;

  return (
    <div className="flex min-h-full flex-1 flex-col bg-slate-50 dark:bg-slate-950">
      <AppHeader title="Audit Log" role="admin" profile={profile} navLinks={NAV_LINKS} />
      <HelpPanel pageKey="admin-audit" title="Reading the audit log">
        <p>
          Every login, logout, district lock/unlock, and DEO provisioning batch is recorded
          here, newest first. Entries older than 30 days are removed automatically.
        </p>
        <p>Unlock events include the reason the admin gave when reopening a submission.</p>
      </HelpPanel>
      <div className="w-full flex-1 px-4 py-6 sm:px-6 lg:px-[15%]">
        {error && (
          <div className="mb-4">
            <Banner variant="error">{error}</Banner>
          </div>
        )}

        <div className="max-h-[65vh] overflow-auto rounded-lg border border-slate-200 bg-white shadow-sm [scrollbar-width:thin] scroll-smooth dark:border-slate-800 dark:bg-slate-900">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800">
                <th className="sticky top-0 z-10 whitespace-nowrap bg-slate-50 px-3 py-2.5 text-left font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                  When (IST)
                </th>
                <th
                  onClick={() => setEventSort((s) => (s === "asc" ? "desc" : s === "desc" ? null : "asc"))}
                  className="sticky top-0 z-10 cursor-pointer select-none whitespace-nowrap bg-slate-50 px-3 py-2.5 text-left font-medium text-slate-600 hover:text-slate-900 dark:bg-slate-800 dark:text-slate-400 dark:hover:text-slate-100"
                >
                  Event
                  {eventSort ? { asc: " ▲", desc: " ▼" }[eventSort] : " ⇅"}
                </th>
                <th className="sticky top-0 z-10 whitespace-nowrap bg-slate-50 px-3 py-2.5 text-left font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                  Actor
                </th>
                <th className="sticky top-0 z-10 whitespace-nowrap bg-slate-50 px-3 py-2.5 text-left font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                  District
                </th>
                <th className="sticky top-0 z-10 bg-slate-50 px-3 py-2.5 text-left font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                  Details
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-slate-500 dark:text-slate-400">
                    {loading ? "Loading..." : "No activity in the last 30 days."}
                  </td>
                </tr>
              ) : (
                sortedRows.map((row) => (
                  <tr key={row.id} className="border-t border-slate-100 bg-white dark:border-slate-800 dark:bg-slate-900">
                    <td className="whitespace-nowrap px-3 py-2.5 text-slate-800 dark:text-slate-200">
                      {formatIST(row.createdAt)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-slate-800 dark:text-slate-200">
                      {EVENT_LABELS[row.eventType] ?? row.eventType}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-slate-800 dark:text-slate-200">
                      {row.actorEmail ?? (row.actorRole ? `(${row.actorRole})` : "—")}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-slate-800 dark:text-slate-200">
                      {row.districtName ?? "—"}
                    </td>
                    <td className="px-3 py-2.5 text-slate-600 dark:text-slate-400">{describeMetadata(row)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-3 flex items-center justify-between text-sm text-slate-600 dark:text-slate-400">
          <button
            type="button"
            onClick={() => loadPage(page - 1)}
            disabled={page <= 1 || loading}
            style={page <= 1 || loading ? { cursor: "not-allowed" } : undefined}
            className="rounded-full border border-slate-300 bg-white px-2.5 py-1 hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-white dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:disabled:hover:bg-slate-900"
          >
            <i className="ti ti-chevron-left text-sm" />
          </button>
          <span>Page {page}</span>
          <button
            type="button"
            onClick={() => loadPage(page + 1)}
            disabled={rows.length === 0 || loading}
            style={rows.length === 0 || loading ? { cursor: "not-allowed" } : undefined}
            className="rounded-full border border-slate-300 bg-white px-2.5 py-1 hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-white dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:disabled:hover:bg-slate-900"
          >
            <i className="ti ti-chevron-right text-sm" />
          </button>
        </div>
      </div>
    </div>
  );
}
