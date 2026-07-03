"use client";

import { useEffect, useMemo, useState } from "react";
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
import { readClientSession, clearClientSession } from "@/lib/session";
import { alertError, alertSuccess } from "@/lib/alerts";
import { exportDistrictsToXlsx } from "@/lib/export";

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
      await alertError(err instanceof ApiError ? err.message : "सिंक विफल रहा।");
    } finally {
      setSyncing(false);
    }
  }

  useEffect(() => {
    (async () => {
      const session = readClientSession();
      if (!session || session.role !== "admin") {
        router.replace("/login");
        return;
      }
      try {
        await apiFetch("/api/auth/me");
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
      await alertSuccess("जिला अनलॉक कर दिया गया है।");
    } catch (err) {
      await alertError(err instanceof ApiError ? err.message : "अनलॉक विफल रहा।");
    }
  }

  async function exportExcel() {
    await sync();
    exportDistrictsToXlsx(districts, pacData);
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

  const columns = useMemo(
    () => [
      columnHelper.accessor("districtName", {
        header: "जिला (District)",
        cell: (info) => info.getValue(),
      }),
      columnHelper.accessor("lockStatus", {
        header: "स्थिति",
        cell: (info) => (
          <span
            className={`rounded px-2 py-0.5 text-xs font-medium ${
              info.getValue() === 1 ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"
            }`}
          >
            {info.getValue() === 1 ? "लॉक्ड" : "अनलॉक्ड"}
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
        header: "शुद्ध वसूली योग्य",
        cell: ({ row }) =>
          `₹${netRecoverable(row.original.grossArrears, row.original.recoveredAmount, row.original.stayAmount).toLocaleString(
            "en-IN",
            { minimumFractionDigits: 2 }
          )}`,
      }),
      columnHelper.display({
        id: "actions",
        header: "कार्रवाई",
        cell: ({ row }) =>
          row.original.lockStatus === 1 ? (
            <button
              onClick={() => unlock(row.original.id)}
              className="rounded bg-zinc-900 px-2 py-1 text-xs font-medium text-white"
            >
              अनलॉक करें
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
    <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="mr-auto text-lg font-semibold text-zinc-900">Admin Dashboard — 75 जिले</h1>
        <select
          value={selectedYear}
          onChange={(e) => setSelectedYear(e.target.value as (typeof FINANCIAL_YEARS)[number])}
          className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
        >
          {FINANCIAL_YEARS.map((fy) => (
            <option key={fy} value={fy}>
              {fy}
            </option>
          ))}
        </select>
        <input
          type="text"
          placeholder="जिला खोजें..."
          value={globalFilter}
          onChange={(e) => setGlobalFilter(e.target.value)}
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm"
        />
        <button
          onClick={sync}
          disabled={syncing}
          className="rounded-md bg-zinc-100 px-3 py-1.5 text-sm font-medium text-zinc-700 disabled:opacity-50"
        >
          {syncing ? "सिंक हो रहा है..." : "सिंक करें"}
        </button>
        <button onClick={exportExcel} className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white">
          Excel में निर्यात करें
        </button>
      </div>

      <div className="overflow-x-auto rounded-md border border-zinc-200">
        <table className="w-full min-w-[1100px] border-collapse text-sm">
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className="bg-zinc-100">
                {hg.headers.map((header) => (
                  <th
                    key={header.id}
                    onClick={header.column.getToggleSortingHandler()}
                    className={`sticky top-0 whitespace-nowrap px-3 py-2 text-left font-medium text-zinc-700 ${
                      header.column.getCanSort() ? "cursor-pointer select-none" : ""
                    } ${header.column.getIsPinned() ? "left-0 z-10 bg-zinc-100" : ""}`}
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                    {{ asc: " ▲", desc: " ▼" }[header.column.getIsSorted() as string] ?? ""}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className="border-t border-zinc-200">
                {row.getVisibleCells().map((cell) => (
                  <td
                    key={cell.id}
                    className={`whitespace-nowrap px-3 py-2 ${
                      cell.column.getIsPinned() ? "sticky left-0 z-10 bg-white" : ""
                    }`}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
