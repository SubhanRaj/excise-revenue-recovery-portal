"use client";

import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { clearClientSession } from "@/lib/session";
import { confirmLogout, notifyToast } from "@/lib/alerts";
import ProfileMenu, { type Profile } from "./ProfileMenu";

export default function AppHeader({ title, profile }: { title: string; profile?: Profile | null }) {
  const router = useRouter();

  async function logout() {
    if (!(await confirmLogout())) return;
    await apiFetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    clearClientSession();
    notifyToast({ icon: "info", title: "Logged out" });
    router.replace("/login");
  }

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600 text-base font-bold text-white">
          ₹
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900">{title}</p>
          <p className="truncate text-xs text-slate-500">Excise Revenue Recovery Portal</p>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <ProfileMenu profile={profile ?? null} />
          <button
            onClick={logout}
            className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700"
          >
            <i className="ti ti-logout text-base" />
            Logout
          </button>
        </div>
      </div>
    </header>
  );
}
