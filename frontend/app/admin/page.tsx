"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from "@tanstack/react-table";
import { db, type CachedDistrict, type CachedPacData } from "@/lib/db";
import { FINANCIAL_YEARS, PAC_FIELD_ORDER, PAC_FIELD_LABELS, isMoneyField, netRecoverable } from "@/lib/pac-fields";
import { apiFetch, ApiError } from "@/lib/api";
import { readClientSession, clearClientSession, consumeJustAuthed } from "@/lib/session";
import { notifyToast } from "@/lib/alerts";
import { exportDistrictsToXlsx, downloadDeoTemplate, parseDeoTemplateFile } from "@/lib/export";
import AppHeader from "@/components/ui/AppHeader";
import Button from "@/components/ui/Button";
import Banner from "@/components/ui/Banner";
import HelpPanel from "@/components/ui/HelpPanel";
import type { Profile } from "@/components/ui/ProfileMenu";

type Row = CachedDistrict & Record<(typeof PAC_FIELD_ORDER)[number], number>;

const columnHelper = createColumnHelper<Row>();

function formatValue(field: (typeof PAC_FIELD_ORDER)[number], value: number) {
  return isMoneyField(field)
    ? `₹${value.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`
    : value.toLocaleString("en-IN");
}

export default function AdminPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [districts, setDistricts] = useState<CachedDistrict[]>([]);
  const [pacData, setPacData] = useState<CachedPacData[]>([]);
  const [selectedYear, setSelectedYear] = useState<(typeof FINANCIAL_YEARS)[number]>(FINANCIAL_YEARS[0]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [sorting, setSorting] = useState<SortingState>([]);
  const [syncing, setSyncing] = useState(false);
  const [provisioning, setProvisioning] = useState(false);
  const [banner, setBanner] = useState<{ variant: "error" | "success"; message: string } | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const deoFileInputRef = useRef<HTMLInputElement>(null);

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
      setBanner({ variant: "error", message: err instanceof ApiError ? err.message : "Sync failed." });
    } finally {
      setSyncing(false);
    }
  }

  useEffect(() => {
    if (!banner || banner.variant === "error") return;
    const t = setTimeout(() => setBanner(null), 3500);
    return () => clearTimeout(t);
  }, [banner]);

  useEffect(() => {
    (async () => {
      const session = readClientSession();
      if (!session || session.role !== "admin") {
        router.replace("/login");
        return;
      }
      try {
        const p = await apiFetch<Profile>("/api/auth/me");
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  async function unlock(districtId: number) {
    try {
      await apiFetch("/api/admin/unlock", { method: "POST", body: JSON.stringify({ districtId }) });
      setDistricts((prev) => prev.map((d) => (d.id === districtId ? { ...d, lockStatus: 0 } : d)));
      await db.adminDistricts.update(districtId, { lockStatus: 0 });
      setBanner({ variant: "success", message: "District unlocked." });
    } catch (err) {
      setBanner({ variant: "error", message: err instanceof ApiError ? err.message : "Unlock failed." });
    }
  }

  async function exportExcel() {
    await sync();
    exportDistrictsToXlsx(districts, pacData);
  }

  async function handleDeoFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file name after a fix-and-reupload
    if (!file) return;

    setProvisioning(true);
    try {
      const buffer = await file.arrayBuffer();
      const workbook = window.XLSX.read(buffer, { type: "array" });
      const templateRows = parseDeoTemplateFile(workbook);
      if (templateRows.length === 0) {
        setBanner({ variant: "error", message: "No rows found in the uploaded file." });
        return;
      }

      const { results } = await apiFetch<{
        results: { districtName: string; status: "inserted" | "updated" | "skipped" | "error"; message?: string }[];
      }>("/api/admin/provision-deos", { method: "POST", body: JSON.stringify({ rows: templateRows }) });

      const inserted = results.filter((r) => r.status === "inserted").length;
      const updated = results.filter((r) => r.status === "updated").length;
      const errors = results.filter((r) => r.status === "error");

      notifyToast({
        icon: errors.length > 0 ? "error" : "success",
        title: `${inserted} added, ${updated} updated${errors.length ? `, ${errors.length} failed` : ""}`,
      });
      if (errors.length > 0) {
        setBanner({
          variant: "error",
          message: `Failed rows: ${errors.map((r) => `${r.districtName} (${r.message})`).join("; ")}`,
        });
      }
    } catch (err) {
      setBanner({ variant: "error", message: err instanceof ApiError ? err.message : "Upload failed." });
    } finally {
      setProvisioning(false);
    }
  }

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

  const totals = useMemo(() => {
    const sums = Object.fromEntries(
      PAC_FIELD_ORDER.map((field) => [field, rows.reduce((sum, r) => sum + r[field], 0)])
    ) as Record<(typeof PAC_FIELD_ORDER)[number], number>;
    const netRecoverableTotal = rows.reduce(
      (sum, r) => sum + netRecoverable(r.grossArrears, r.recoveredAmount, r.stayAmount),
      0
    );
    return { sums, netRecoverableTotal };
  }, [rows]);

  const columns = useMemo(
    () => [
      columnHelper.accessor("districtName", {
        header: "District",
        cell: (info) => info.getValue(),
      }),
      columnHelper.accessor("lockStatus", {
        header: "Status",
        cell: (info) => (
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${
              info.getValue() === 1 ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"
            }`}
          >
            <i className={`ti ${info.getValue() === 1 ? "ti-lock" : "ti-lock-open"} text-sm`} />
            {info.getValue() === 1 ? "Locked" : "Unlocked"}
          </span>
        ),
      }),
      ...PAC_FIELD_ORDER.map((field) =>
        columnHelper.accessor(field, {
          header: PAC_FIELD_LABELS[field],
          cell: (info) => formatValue(field, info.getValue()),
        })
      ),
      columnHelper.display({
        id: "netRecoverable",
        header: "Net Recoverable",
        cell: ({ row }) =>
          `₹${netRecoverable(row.original.grossArrears, row.original.recoveredAmount, row.original.stayAmount).toLocaleString(
            "en-IN",
            { minimumFractionDigits: 2 }
          )}`,
      }),
      columnHelper.display({
        id: "actions",
        header: "Action",
        cell: ({ row }) =>
          row.original.lockStatus === 1 ? (
            <button
              onClick={() => unlock(row.original.id)}
              className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Unlock
            </button>
          ) : null,
      }),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const table = useReactTable({
    data: rows,
    columns,
    state: { globalFilter, sorting, columnPinning: { left: ["districtName"] } },
    onGlobalFilterChange: setGlobalFilter,
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  if (!ready) return null;

  return (
    <div className="flex min-h-full flex-1 flex-col bg-slate-50">
      <AppHeader title="Admin Dashboard" profile={profile} />
      <HelpPanel pageKey="admin-dashboard" title="Using this dashboard">
        <p>
          Pick a financial year, then <strong>Sync</strong> to pull the latest districts and
          PAC data from the server into this browser&apos;s local cache.
        </p>
        <p>
          Click a column header to sort; use the search box to filter by district name. The
          District column stays pinned while you scroll horizontally.
        </p>
        <p>
          The bottom row totals every numeric column for the selected year across all 75
          districts.
        </p>
        <p>
          <strong>Export to Excel</strong> re-syncs first, then builds the spreadsheet from the
          freshly-synced data. <strong>Unlock</strong> lets a District Excise Officer re-edit a
          submission they already locked.
        </p>
        <p>
          <strong>Download DEO Template</strong> gives you all 75 districts pre-filled; type
          each DEO&apos;s CUG mobile number and/or email into the blank columns and
          <strong> Upload DEO Data</strong> the same file back to add or update their login.
          Existing DEOs are updated, not duplicated, by matching district name.
        </p>
      </HelpPanel>
      <div className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-8">
        {banner && (
          <div className="mb-4">
            <Banner variant={banner.variant}>{banner.message}</Banner>
          </div>
        )}
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <div className="mr-auto">
            <h1 className="text-lg font-semibold text-slate-900">75 Districts</h1>
            <p className="text-sm text-slate-500">Review, sync, and export PAC recovery data.</p>
          </div>
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(e.target.value as (typeof FINANCIAL_YEARS)[number])}
            className="rounded-md border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-700 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
          >
            {FINANCIAL_YEARS.map((fy) => (
              <option key={fy} value={fy}>
                {fy}
              </option>
            ))}
          </select>
          <input
            type="text"
            placeholder="Search district..."
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
          />
          <Button variant="secondary" onClick={sync} disabled={syncing}>
            <i className={`ti ti-refresh text-base ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Syncing..." : "Sync"}
          </Button>
          <Button variant="secondary" onClick={() => downloadDeoTemplate(districts)}>
            <i className="ti ti-download text-base" />
            Download DEO Template
          </Button>
          <input
            ref={deoFileInputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={handleDeoFileSelected}
            className="hidden"
          />
          <Button
            variant="secondary"
            onClick={() => deoFileInputRef.current?.click()}
            disabled={provisioning}
          >
            <i className={`ti ti-upload text-base ${provisioning ? "animate-pulse" : ""}`} />
            {provisioning ? "Uploading..." : "Upload DEO Data"}
          </Button>
          <Button onClick={exportExcel}>
            <i className="ti ti-file-spreadsheet text-base" />
            Export to Excel
          </Button>
        </div>

        <div className="max-h-[70vh] overflow-auto rounded-lg border border-slate-200 bg-white shadow-sm [scrollbar-width:thin] scroll-smooth">
          <table className="w-full border-collapse text-sm">
            <thead>
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id} className="bg-slate-50">
                  {hg.headers.map((header) => (
                    <th
                      key={header.id}
                      onClick={header.column.getToggleSortingHandler()}
                      className={`sticky top-0 z-20 whitespace-nowrap bg-slate-50 px-3 py-2.5 text-left font-medium text-slate-600 ${
                        header.column.getCanSort() ? "cursor-pointer select-none hover:text-slate-900" : ""
                      } ${header.column.getIsPinned() ? "left-0 z-30" : ""}`}
                    >
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {{ asc: " ▲", desc: " ▼" }[header.column.getIsSorted() as string] ??
                        (header.column.getCanSort() ? " ⇅" : "")}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((row) => (
                <tr key={row.id} className="border-t border-slate-100 bg-white hover:bg-slate-50">
                  {row.getVisibleCells().map((cell) => (
                    <td
                      key={cell.id}
                      className={`whitespace-nowrap px-3 py-2.5 text-slate-800 ${
                        cell.column.getIsPinned() ? "sticky left-0 z-10 bg-inherit font-medium" : ""
                      }`}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="sticky bottom-0 z-20 border-t-2 border-slate-300 bg-slate-100 font-semibold text-slate-900">
                <td className="sticky left-0 z-30 whitespace-nowrap bg-slate-100 px-3 py-2.5">Total</td>
                <td className="whitespace-nowrap px-3 py-2.5" />
                {PAC_FIELD_ORDER.map((field) => (
                  <td key={field} className="whitespace-nowrap px-3 py-2.5">
                    {formatValue(field, totals.sums[field])}
                  </td>
                ))}
                <td className="whitespace-nowrap px-3 py-2.5">
                  ₹{totals.netRecoverableTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5" />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
