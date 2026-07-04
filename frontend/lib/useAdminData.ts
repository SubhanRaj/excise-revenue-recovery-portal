"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { db, type CachedDistrict, type CachedPacData } from "@/lib/db";
import { apiFetch, ApiError } from "@/lib/api";
import { clearClientSession, consumeJustAuthed } from "@/lib/session";
import { notifyToast } from "@/lib/alerts";
import type { Profile } from "@/components/ui/ProfileMenu";

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

  async function sync() {
    setSyncing(true);
    try {
      const res = await apiFetch<{ districts: CachedDistrict[]; pacData: CachedPacData[] }>(
        "/api/admin/districts"
      );
      await db.transaction("rw", db.adminDistricts, db.adminPacData, async () => {
        await db.adminDistricts.clear();
        await db.adminPacData.clear();
        await db.adminDistricts.bulkPut(res.districts);
        await db.adminPacData.bulkPut(res.pacData);
      });
      setDistricts(res.districts);
      setPacData(res.pacData);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Sync failed.");
    } finally {
      setSyncing(false);
    }
  }

  useEffect(() => {
    (async () => {
      // Ask the server directly rather than pre-checking a local hint: the admin and DEO
      // sessions now live in two separate cookies (lib/session.ts on the API side), so a
      // shared localStorage "last role" hint can go stale the moment the *other* role logs in
      // on a different tab of the same browser — trusting it here was the actual cause of
      // being bounced to /login when switching between /admin and /deo-data-entry.
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

  async function unlock(districtId: number) {
    await apiFetch("/api/admin/unlock", { method: "POST", body: JSON.stringify({ districtId }) });
    setDistricts((prev) => prev.map((d) => (d.id === districtId ? { ...d, lockStatus: 0 } : d)));
    await db.adminDistricts.update(districtId, { lockStatus: 0 });
  }

  return { ready, profile, districts, pacData, setDistricts, setPacData, sync, syncing, unlock, error, setError };
}
