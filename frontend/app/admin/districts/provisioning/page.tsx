"use client";

import { useRef, useState } from "react";
import { ApiError, apiFetch } from "@/lib/api";
import { notifyToast } from "@/lib/alerts";
import { downloadDeoTemplate, parseDeoTemplateFile } from "@/lib/export";
import { useAdminData } from "@/lib/useAdminData";
import AppHeader, { type NavLink } from "@/components/ui/AppHeader";
import Button from "@/components/ui/Button";
import Banner from "@/components/ui/Banner";
import HelpPanel from "@/components/ui/HelpPanel";

const NAV_LINKS: NavLink[] = [
  { label: "Dashboard", href: "/admin" },
  { label: "Districts", href: "/admin/districts" },
  { label: "Unlock Requests", href: "/admin/unlock-requests" },
  { label: "Audit Log", href: "/admin/audit" },
];

export default function DeoProvisioningPage() {
  const { ready, profile, districts, sync, syncing, lastSyncedAt, error, setError } = useAdminData();
  const [provisioning, setProvisioning] = useState(false);
  const deoFileInputRef = useRef<HTMLInputElement>(null);

  async function handleDeoFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file name after a fix-and-reupload
    if (!file) return;

    setProvisioning(true);
    try {
      const buffer = await file.arrayBuffer();
      const workbook = new window.ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);
      const templateRows = parseDeoTemplateFile(workbook);
      if (templateRows.length === 0) {
        setError("No rows found in the uploaded file.");
        return;
      }

      const { results } = await apiFetch<{
        results: { districtName: string; status: "inserted" | "updated" | "skipped" | "error"; message?: string }[];
      }>("/api/admin/provision-deos", { method: "POST", body: JSON.stringify({ rows: templateRows }) }, "admin");

      const inserted = results.filter((r) => r.status === "inserted").length;
      const updated = results.filter((r) => r.status === "updated").length;
      const errors = results.filter((r) => r.status === "error");

      notifyToast({
        icon: errors.length > 0 ? "error" : "success",
        title: `${inserted} added, ${updated} updated${errors.length ? `, ${errors.length} failed` : ""}`,
      });
      if (errors.length > 0) {
        setError(`Failed rows: ${errors.map((r) => `${r.districtName} (${r.message})`).join("; ")}`);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Upload failed.");
    } finally {
      setProvisioning(false);
    }
  }

  if (!ready) {
    return (
      <div className="flex min-h-full flex-1 flex-col bg-slate-50 p-6 dark:bg-slate-950">
        <div className="h-8 w-64 animate-pulse rounded-md bg-slate-200 dark:bg-slate-800" />
        <div className="mt-8 h-40 w-full max-w-2xl animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800" />
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-1 flex-col bg-slate-50 dark:bg-slate-950">
      <AppHeader
        title="DEO Provisioning"
        role="admin"
        profile={profile}
        navLinks={NAV_LINKS}
        onSync={sync}
        syncing={syncing}
        lastSyncedAt={lastSyncedAt}
        districts={districts}
      />
      <HelpPanel pageKey="admin-provisioning" title="Provisioning DEO logins">
        <p>
          <strong>Download DEO Template</strong> gives you all 75 districts pre-filled; type
          each DEO&apos;s CUG mobile number and/or email into the blank columns and upload the
          same file back with <strong>Upload DEO Data</strong> to add or update their login.
          Existing DEOs are updated, not duplicated, by matching district name. Blank rows are
          skipped.
        </p>
      </HelpPanel>
      <div className="flex w-full flex-1 flex-col items-start px-4 py-6 sm:px-6 lg:px-[10%] xl:px-[5%] 2xl:px-[3%]">
        {error && (
          <div className="mb-4 w-full max-w-2xl">
            <Banner variant="error">{error}</Banner>
          </div>
        )}

        <div className="w-full max-w-2xl rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Bulk DEO login provisioning
          </h2>
          <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400">
            Download the template, fill in CUG mobile numbers and/or emails for the districts
            you want to provision, then upload the same file back.
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-2.5">
            <Button variant="blue" onClick={() => void downloadDeoTemplate(districts)}>
              <i className="ti ti-download text-base" />
              DEO Template
            </Button>
            <input
              ref={deoFileInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={handleDeoFileSelected}
              className="hidden"
            />
            <Button variant="amber" onClick={() => deoFileInputRef.current?.click()} disabled={provisioning}>
              <i className={`ti ti-upload text-base ${provisioning ? "animate-pulse" : ""}`} />
              {provisioning ? "Uploading..." : "Upload DEO Data"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
