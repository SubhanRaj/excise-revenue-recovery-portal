"use client";

import { useEffect, useRef, useState } from "react";

export type Profile = {
  role: "deo" | "admin";
  districtId: number | null;
  districtName: string | null;
  email: string | null;
  // Only meaningful for role "deo" — null for admin profiles. Lets deo-data-entry/page.tsx tell
  // a still-locked district apart from a freshly-unlocked one right after login.
  lockStatus?: number | null;
  lockedAt?: string | null;
  submittedByName?: string | null;
};

export default function ProfileMenu({ profile, onLogout }: { profile: Profile | null; onLogout?: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  if (!profile) return null;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Account details"
        className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
      >
        <span className="flex h-7 items-center justify-center rounded-full bg-blue-100 px-3 text-xs font-semibold text-blue-700 dark:bg-blue-900 dark:text-blue-300">
          {profile.role === "admin" ? "Admin" : profile.districtName ? `DEO ${profile.districtName}` : "DEO"}
        </span>
        <i className={`ti ti-chevron-down text-sm transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-30 mt-1 w-64 space-y-2 rounded-lg border border-slate-200 bg-white p-3 text-sm shadow-xl dark:border-slate-700 dark:bg-slate-900"
        >
          <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
            <i className="ti ti-shield-check text-base" />
            <span className="font-medium">{profile.role === "admin" ? "Admin" : "District Excise Officer"}</span>
          </div>
          {profile.districtName && (
            <div className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
              <i className="ti ti-map-pin text-base text-slate-400" />
              {profile.districtName}
            </div>
          )}
          {profile.email && (
            <div className="flex items-center gap-1.5 truncate text-slate-700 dark:text-slate-300">
              <i className="ti ti-mail text-base text-slate-400" />
              <span className="truncate">{profile.email}</span>
            </div>
          )}
          {onLogout && (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onLogout();
              }}
              className="flex w-full items-center gap-1.5 rounded-md border-t border-slate-100 px-0 pt-2 text-red-600 hover:text-red-700 dark:border-slate-800 dark:text-red-400 dark:hover:text-red-300"
            >
              <i className="ti ti-logout text-base" />
              Logout
            </button>
          )}
        </div>
      )}
    </div>
  );
}
