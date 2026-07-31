"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatIST } from "@/lib/format";
import { apiFetch, ApiError } from "@/lib/api";
import { notifyToast } from "@/lib/alerts";
import { useAdminData } from "@/lib/useAdminData";
import AppHeader, { type NavLink } from "@/components/ui/AppHeader";
import Banner from "@/components/ui/Banner";
import Button from "@/components/ui/Button";
import HelpPanel from "@/components/ui/HelpPanel";

const NAV_LINKS: NavLink[] = [
  { label: "Dashboard", href: "/admin" },
  { label: "Districts", href: "/admin/districts" },
  { label: "Unlock Requests", href: "/admin/unlock-requests" },
  { label: "Audit Log", href: "/admin/audit" },
];

type AdminRow = {
  id: number;
  email: string;
  name: string | null;
  designation: string | null;
  createdAt: string;
  isOwner: boolean;
};

type FormState = { name: string; email: string; designation: string };
const EMPTY_FORM: FormState = { name: "", email: "", designation: "" };

// Same "blocking confirm before an irreversible/session-ending action" pattern as
// confirmClearYear()/confirmUnlockRequest() in alerts.ts — not added there since this is the
// only call site and its title/body are specific to this one action.
async function confirmDeleteAdmin(name: string): Promise<boolean> {
  const result = await window.Swal.fire({
    icon: "warning",
    title: `Remove ${name}?`,
    text: "This permanently deletes their admin account. They will no longer be able to log in.",
    showCancelButton: true,
    confirmButtonText: "Yes, remove",
    cancelButtonText: "Cancel",
    confirmButtonColor: "#dc2626",
  });
  return result.isConfirmed;
}

export default function AdminUsersPage() {
  const router = useRouter();
  const { ready, profile, districts, sync, syncing, lastSyncedAt } = useAdminData();
  const [rows, setRows] = useState<AdminRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  // Hiding this page from a non-owner admin is UX only — the API routes' own OWNER_EMAIL check
  // is the real boundary (same pattern as districts/provisioning/page.tsx).
  useEffect(() => {
    if (ready && profile && !profile.isOwner) router.replace("/admin");
  }, [ready, profile, router]);

  async function load() {
    setLoading(true);
    try {
      const res = await apiFetch<{ rows: AdminRow[] }>("/api/admin/users", undefined, "admin");
      setRows(res.rows);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load admin users.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (ready && profile?.isOwner) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, profile?.isOwner]);

  function startCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormOpen(true);
  }

  function startEdit(row: AdminRow) {
    setEditingId(row.id);
    setForm({ name: row.name ?? "", email: row.email, designation: row.designation ?? "" });
    setFormOpen(true);
  }

  async function saveForm(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      if (editingId === null) {
        await apiFetch("/api/admin/users", { method: "POST", body: JSON.stringify(form) }, "admin");
        notifyToast({ icon: "success", title: "Admin added" });
      } else {
        await apiFetch("/api/admin/users", { method: "PATCH", body: JSON.stringify({ id: editingId, ...form }) }, "admin");
        notifyToast({ icon: "success", title: "Admin updated" });
      }
      setFormOpen(false);
      await load();
    } catch (err) {
      notifyToast({ icon: "error", title: "Save failed", text: err instanceof ApiError ? err.message : "Please try again." });
    } finally {
      setSaving(false);
    }
  }

  async function remove(row: AdminRow) {
    if (!(await confirmDeleteAdmin(row.name ?? row.email))) return;
    try {
      await apiFetch("/api/admin/users", { method: "DELETE", body: JSON.stringify({ id: row.id }) }, "admin");
      notifyToast({ icon: "success", title: "Admin removed" });
      await load();
    } catch (err) {
      notifyToast({ icon: "error", title: "Failed", text: err instanceof ApiError ? err.message : "Please try again." });
    }
  }

  if (!ready || !profile?.isOwner) {
    return (
      <div className="flex min-h-full flex-1 flex-col bg-slate-50 dark:bg-slate-950">
        <div className="h-8 w-64 animate-pulse rounded-md bg-slate-200 m-6 dark:bg-slate-800" />
        <div className="mx-6 h-[400px] animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800" />
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-1 flex-col bg-slate-50 dark:bg-slate-950">
      <AppHeader
        title="Admin Users"
        role="admin"
        profile={profile}
        navLinks={NAV_LINKS}
        onSync={sync}
        syncing={syncing}
        lastSyncedAt={lastSyncedAt}
        districts={districts}
      />
      <HelpPanel pageKey="admin-users" title="Managing admin accounts">
        <p>
          Add new admin/HQ officials here, or edit an existing one&apos;s name, email, or
          designation. The owner account (whoever&apos;s email matches this deployment&apos;s
          <code> OWNER_EMAIL</code>) can&apos;t have its email changed or be deleted here — that
          would lock the owner out of owner-only pages like this one.
        </p>
      </HelpPanel>
      <div className="w-full flex-1 px-4 py-6 sm:px-6 lg:px-[10%] xl:px-[5%] 2xl:px-[3%]">
        {error && (
          <div className="mb-4">
            <Banner variant="error">{error}</Banner>
          </div>
        )}

        <div className="mb-4 flex items-center justify-end">
          <Button size="sm" onClick={startCreate}>
            <i className="ti ti-user-plus text-base" />
            Add Admin
          </Button>
        </div>

        {formOpen && (
          <form
            onSubmit={saveForm}
            className="mb-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
          >
            <h2 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">
              {editingId === null ? "Add Admin" : "Edit Admin"}
            </h2>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Full Name</label>
                <input
                  required
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Email</label>
                <input
                  required
                  type="email"
                  disabled={editingId !== null && rows.find((r) => r.id === editingId)?.isOwner}
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  style={editingId !== null && rows.find((r) => r.id === editingId)?.isOwner ? { cursor: "not-allowed" } : undefined}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Designation (optional)</label>
                <input
                  value={form.designation}
                  onChange={(e) => setForm((f) => ({ ...f, designation: e.target.value }))}
                  placeholder="e.g. Excise Commissioner"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <Button type="submit" size="sm" disabled={saving}>
                {saving ? "Saving..." : "Save"}
              </Button>
              <Button type="button" variant="secondary" size="sm" onClick={() => setFormOpen(false)}>
                Cancel
              </Button>
            </div>
          </form>
        )}

        <div className="min-h-[400px] max-h-[70vh] overflow-auto rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800">
                <th className="sticky top-0 z-10 whitespace-nowrap bg-slate-50 px-3 py-2.5 text-left font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">Name</th>
                <th className="sticky top-0 z-10 whitespace-nowrap bg-slate-50 px-3 py-2.5 text-left font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">Email</th>
                <th className="sticky top-0 z-10 whitespace-nowrap bg-slate-50 px-3 py-2.5 text-left font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">Designation</th>
                <th className="sticky top-0 z-10 whitespace-nowrap bg-slate-50 px-3 py-2.5 text-left font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">Added (IST)</th>
                <th className="sticky top-0 z-10 whitespace-nowrap bg-slate-50 px-3 py-2.5 text-left font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-slate-500 dark:text-slate-400">
                    {loading ? "Loading..." : "No admin users."}
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className="border-t border-slate-100 bg-white dark:border-slate-800 dark:bg-slate-900">
                    <td className="whitespace-nowrap px-3 py-2.5 font-medium text-slate-800 dark:text-slate-200">
                      {row.name ?? "—"}
                      {row.isOwner && (
                        <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                          Owner
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-slate-700 dark:text-slate-300">{row.email}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-slate-700 dark:text-slate-300">{row.designation ?? "—"}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-slate-600 dark:text-slate-400">{formatIST(row.createdAt)}</td>
                    <td className="whitespace-nowrap px-3 py-2.5">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => startEdit(row)}
                          className="rounded-md bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100 dark:bg-blue-950 dark:text-blue-300 dark:hover:bg-blue-900"
                        >
                          Edit
                        </button>
                        {!row.isOwner && (
                          <button
                            type="button"
                            onClick={() => remove(row)}
                            className="rounded-md bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-100 dark:bg-red-950 dark:text-red-300 dark:hover:bg-red-900"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
