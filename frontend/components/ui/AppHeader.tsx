"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { clearClientSession } from "@/lib/session";
import { confirmLogout, notifyToast } from "@/lib/alerts";
import { setNavDistrictId } from "@/lib/adminNav";
import { formatIST } from "@/lib/format";
import ProfileMenu, { type Profile } from "./ProfileMenu";
import ThemeToggle from "./ThemeToggle";

export type NavLink = { label: string; href: string };
export type SearchableDistrict = { id: number; districtName: string };

type Props = {
  title: string;
  role: "admin" | "deo";
  profile?: Profile | null;
  navLinks?: NavLink[];
  onSync?: () => void;
  syncing?: boolean;
  lastSyncedAt?: string | null;
  districts?: SearchableDistrict[];
};

// Global "jump to a district" search, shown whenever a page passes `districts` (every /admin/*
// page, via useAdminData). Separate from the Districts page's own table search box — this one
// is reachable from anywhere and navigates straight to that district's detail page.
function DistrictSearch({ districts }: { districts: SearchableDistrict[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return districts.filter((d) => d.districtName.toLowerCase().includes(q)).slice(0, 8);
  }, [query, districts]);

  function goTo(id: number) {
    setQuery("");
    setOpen(false);
    setNavDistrictId(id);
    router.push("/admin/districts/detail");
  }

  // No leading search icon here — a Tabler <i> icon overlapping live input text renders via an
  // async-loading CSS ::before glyph, which can flash a fallback tofu box on top of the text
  // before the font loads (see the identical fix on TextField.tsx and the earlier admin
  // district search input, both of which dropped their icon for the same reason).
  return (
    <div className="relative hidden w-44 shrink-0 lg:block">
      <input
        type="text"
        placeholder="Jump to district..."
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && matches[0]) goTo(matches[0].id);
        }}
        className="w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
      />
      {open && matches.length > 0 && (
        <ul className="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-900">
          {matches.map((d) => (
            <li key={d.id}>
              <button
                type="button"
                onClick={() => goTo(d.id)}
                className="block w-full px-3 py-1.5 text-left text-sm text-slate-700 hover:bg-blue-50 dark:text-slate-300 dark:hover:bg-blue-950"
              >
                {d.districtName}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function AppHeader({ title, role, profile, navLinks, onSync, syncing, lastSyncedAt, districts }: Props) {
  const router = useRouter();
  const pathname = usePathname();

  async function logout() {
    if (!(await confirmLogout())) return;
    await apiFetch(`/api/auth/logout?role=${role}`, { method: "POST" }, role).catch(() => {});
    clearClientSession(role);
    notifyToast({ icon: "info", title: "Logged out" });
    router.replace("/login");
  }

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-700 text-base font-bold text-white">
          ₹
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</p>
          <p className="truncate text-xs text-slate-500 dark:text-slate-400">Excise Revenue Recovery Portal</p>
        </div>

        {/* Everything else lives in one right-aligned group — deliberately not spread across
            the full header width, which read as cluttered once nav links, search, Sync, the
            theme toggle, and the profile menu all needed a place to live. */}
        <div className="ml-auto flex items-center gap-2">
          {navLinks && (
            <nav className="hidden items-center gap-1 sm:flex">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    pathname === link.href
                      ? "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                      : "text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                  }`}
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          )}
          {districts && <DistrictSearch districts={districts} />}
          {onSync && (
            // 24" FHD admin displays have room for this; it exists so an admin who lands on a
            // page via the instant Dexie cache (no auto-sync, see useAdminData.ts) can tell how
            // stale the numbers on screen are without having to click Sync just to find out.
            <span
              title="When the districts/PAC cache was last refreshed from the server"
              className="hidden items-center gap-1 whitespace-nowrap text-xs text-slate-400 lg:flex dark:text-slate-500"
            >
              <i className="ti ti-clock-hour-4 text-sm" />
              Synced: {formatIST(lastSyncedAt)}
            </span>
          )}
          {onSync && (
            <button
              onClick={onSync}
              disabled={syncing}
              title="Sync latest data from the server"
              className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            >
              <i className={`ti ti-refresh text-base ${syncing ? "animate-spin" : ""}`} />
              <span className="hidden md:inline">{syncing ? "Syncing..." : "Sync"}</span>
            </button>
          )}
          <ThemeToggle />
          <ProfileMenu profile={profile ?? null} onLogout={logout} />
        </div>
      </div>
    </header>
  );
}
