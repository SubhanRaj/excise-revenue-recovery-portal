"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { db, type CachedDistrict, type CachedPacData } from "@/lib/client-db";
import { apiFetch, ApiError } from "@/lib/api";
import { clearLastRole, consumeJustAuthed } from "@/lib/client-session";
import { notifyToast } from "@/lib/alerts";
import type { Profile } from "@/components/ui/ProfileMenu";

// Persisted across page loads/sessions (not just component state) so a returning admin who
// opens a page and gets the Dexie cache instantly (no auto-sync) still sees how stale it is,
// rather than a blank/undefined timestamp until they next click Sync.
const LAST_SYNC_KEY = "excise-portal:admin-last-sync";

// Shared by every /admin/* page: the admin-only session guard, the Dexie-backed
// districts/PAC cache, and the Sync action — so the Dashboard and Districts pages (split
// out of what used to be one page) don't each re-implement the same fetch/cache dance.
export function useAdminData() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [districts, setDistricts] = useState<CachedDistrict[]>([]);
  const [pacData, setPacData] = useState<CachedPacData[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(() =>
    typeof window === "undefined" ? null : localStorage.getItem(LAST_SYNC_KEY)
  );

  // Returns the freshly-synced rows (not just void) so callers that need the *current* data
  // right after syncing — e.g. Export — don't read back their own stale pre-sync render closure.
  async function sync() {
    setSyncing(true);
    try {
      const res = await apiFetch<{ districts: CachedDistrict[]; pacData: CachedPacData[] }>(
        "/api/admin/districts",
        undefined,
        "admin"
      );
      await db.transaction("rw", db.adminDistricts, db.adminPacData, async () => {
        await db.adminDistricts.clear();
        await db.adminPacData.clear();
        await db.adminDistricts.bulkPut(res.districts);
        await db.adminPacData.bulkPut(res.pacData);
      });
      setDistricts(res.districts);
      setPacData(res.pacData);
      const now = new Date().toISOString();
      localStorage.setItem(LAST_SYNC_KEY, now);
      setLastSyncedAt(now);
      return res;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Sync failed.");
      return null;
    } finally {
      setSyncing(false);
    }
  }

  useEffect(() => {
    (async () => {
      // Ask the server directly rather than pre-checking a local hint: the admin and DEO
      // sessions now live in two separate token slots (lib/session.ts on the frontend side),
      // so a shared "last role" hint can go stale the moment the *other* role logs in on a
      // different tab of the same browser — trusting it here was the actual cause of being
      // bounced to /login when switching between /admin and /deo-data-entry.
      try {
        const p = await apiFetch<Profile>("/api/auth/me?role=admin", undefined, "admin");
        setProfile(p);
        if (consumeJustAuthed()) {
          notifyToast({ icon: "success", title: `Welcome, ${p.name ?? p.designation ?? "Admin"}` });
        }
      } catch {
        clearLastRole("admin");
        router.replace("/login");
        return;
      }

      const [cachedDistricts, cachedPacData] = await Promise.all([
        db.adminDistricts.toArray(),
        db.adminPacData.toArray(),
      ]);
      if (cachedDistricts.length > 0) {
        setDistricts(cachedDistricts);
        setPacData(cachedPacData);
        setReady(true);
      } else {
        setReady(true);
        await sync();
      }
    })();
  }, [router]);

  async function unlock(districtId: number, reason: string) {
    await apiFetch("/api/admin/unlock", { method: "POST", body: JSON.stringify({ districtId, reason }) }, "admin");
    const patch = { lockStatus: 0, unlockedAt: new Date().toISOString(), unlockReason: reason, unlockedBy: profile?.name ?? profile?.email ?? null };
    setDistricts((prev) => prev.map((d) => (d.id === districtId ? { ...d, ...patch } : d)));
    await db.adminDistricts.update(districtId, patch);
  }

  async function truncateDemo() {
    await apiFetch("/api/admin/truncate-demo-data", { method: "POST" }, "admin");
    await sync();
  }

  return { ready, profile, districts, pacData, setDistricts, setPacData, sync, syncing, lastSyncedAt, unlock, truncateDemo, error, setError };
}
