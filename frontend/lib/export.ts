import { FINANCIAL_YEARS, PAC_FIELD_ORDER, PAC_FIELD_LABELS, isMoneyField, netRecoverable } from "./pac-fields";
import { SITE_TITLE_EN, DATA_PERIOD_EN } from "./site";
import { formatIST } from "./format";
import type { CachedDistrict, CachedPacData } from "./db";

const RUPEE_FORMAT = '"₹"#,##0.00';
// Two extra rows (title + data period) sit above the header row on every sheet — everything
// below (header row, money-cell formatting, totals) shifts down by this many rows accordingly.
const TITLE_ROWS = 2;

// Same brand blue as the rest of the app (see "Visual language" in CLAUDE.md — blue-700/blue-600,
// the hex equivalents already used for the magic-link email) and a soft blue-100 tint for the
// total row, so this file reads as this portal's own rather than a bare, unstyled data dump.
const HEADER_FILL = "1D4ED8";
const TOTAL_FILL = "DBEAFE";

// This export is read by auditors/senior officers/commissioners, not DEOs — unlike the rest of
// the app, PAC_FIELD_LABELS' Hindi half (there for the government form DEOs fill out) isn't
// needed here, so every label is trimmed to its English half before it reaches a sheet.
function englishLabel(bilingual: string): string {
  return bilingual.split(" / ")[0];
}

// FINANCIAL_YEARS entries are "YYYY-YY" (e.g. "2021-22" runs 1 April 2021 – 31 March 2022) —
// unlike DATA_PERIOD_EN (site.ts), which spans the whole 5-year window for UI chrome shown once,
// each exported sheet is a single FY, so its own banner should name that FY's own period, not the
// portal-wide one.
function dataPeriodForFY(fy: string): string {
  const [startYear, endSuffix] = fy.split("-");
  const endYear = startYear.slice(0, 2) + endSuffix;
  return `Data Period: 1 April ${startYear} to 31 March ${endYear}`;
}

// One workbook, one sheet per financial year (5 sheets) — each sheet is districts × the 6 PAC
// fields for just that year, rather than one sheet with all 5 years' columns side by side.
export function exportDistrictsToXlsx(districts: CachedDistrict[], pacData: CachedPacData[]) {
  const sortedDistricts = [...districts].sort((a, b) => a.districtName.localeCompare(b.districtName));
  // Net Recoverable is a derived, never-persisted value (see pac-fields.ts) — appended as its
  // own trailing column here rather than looped in via PAC_FIELD_ORDER, same as it's rendered
  // as its own extra row (not a 7th PAC_FIELD_ORDER entry) everywhere else it's shown.
  const header = ["District", ...PAC_FIELD_ORDER.map((f) => englishLabel(PAC_FIELD_LABELS[f])), "Net Recoverable"];
  const netRecoverableCol = header.length - 1;
  const moneyColumns = [
    ...PAC_FIELD_ORDER.map((field, i) => (isMoneyField(field) ? i + 1 : -1)).filter((c) => c >= 0),
    netRecoverableCol,
  ];

  const wb = window.XLSX.utils.book_new();
  // _xlnm.Print_Titles is a plain OOXML defined name — unlike frozen panes (view-only, Pro-only
  // in the free SheetJS Community build we're on, see the !freeze no-op below), it's part of
  // the base workbook format and does get written/read by the free build, so "repeat these rows
  // on every printed page" is genuinely achievable here even though "freeze them on screen" isn't.
  const printTitleNames: { Name: string; Sheet: number; Ref: string }[] = [];
  // One shared timestamp for the whole workbook — this is when the download actually happened,
  // in real IST (formatIST(), not toLocaleString("en-IN") alone, which silently uses the
  // browser's own local zone instead).
  const generatedAt = formatIST(new Date().toISOString());

  // A "Summary" cover sheet, appended first (sheet index 0) so it's the first thing the reader
  // sees — when the file was generated and a workbook-wide lock/revenue overview — rather than
  // repeating a generated-at row on all 5 per-FY sheets. Totals here are summed across every
  // district and all 5 FINANCIAL_YEARS, same "whole 5-year window" convention the Admin
  // Dashboard's own KPI cards already use (see admin/page.tsx).
  let totalGrossArrears = 0;
  let totalRecovered = 0;
  let totalNetRecoverable = 0;
  for (const d of districts) {
    for (const fy of FINANCIAL_YEARS) {
      const match = pacData.find((p) => p.districtId === d.id && p.financialYear === fy);
      totalGrossArrears += match?.grossArrears ?? 0;
      totalRecovered += match?.recoveredAmount ?? 0;
      totalNetRecoverable += netRecoverable(match?.grossArrears ?? 0, match?.recoveredAmount ?? 0, match?.stayAmount ?? 0);
    }
  }
  const lockedCount = districts.filter((d) => d.lockStatus === 1).length;

  const summaryRows: (string | number)[][] = [
    [SITE_TITLE_EN],
    [DATA_PERIOD_EN],
    [`Generated: ${generatedAt} IST`],
    [],
    ["Metric", "Value"],
    ["Total Districts", districts.length],
    ["Locked Districts", lockedCount],
    ["Unlocked Districts", districts.length - lockedCount],
    ["Total Gross Arrears (all 5 years)", totalGrossArrears],
    ["Total Recovered Amount (all 5 years)", totalRecovered],
    ["Total Net Recoverable (all 5 years)", totalNetRecoverable],
    [],
    ["Sheets in this workbook", FINANCIAL_YEARS.map((fy) => `FY ${fy}`).join(", ")],
  ];
  const summaryWs = window.XLSX.utils.aoa_to_sheet(summaryRows);
  summaryWs["!cols"] = [{ wch: 32 }, { wch: 40 }];
  summaryWs["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 1 } },
    { s: { r: 2, c: 0 }, e: { r: 2, c: 1 } },
  ];
  summaryWs["A1"].s = { font: { bold: true, sz: 14 }, alignment: { horizontal: "center", vertical: "center" } };
  summaryWs["A2"].s = { font: { italic: true, sz: 11 }, alignment: { horizontal: "center", vertical: "center" } };
  summaryWs["A3"].s = {
    font: { italic: true, sz: 10, color: { rgb: "64748B" } },
    alignment: { horizontal: "center", vertical: "center" },
  };
  for (const c of [0, 1]) {
    const cell = window.XLSX.utils.encode_cell({ r: 4, c });
    summaryWs[cell].s = {
      font: { bold: true, color: { rgb: "FFFFFF" } },
      fill: { fgColor: { rgb: HEADER_FILL } },
      alignment: { horizontal: "center", vertical: "center" },
    };
  }
  // Rows 8–10 (0-indexed) are the three money metrics above — format their value column as ₹.
  for (const r of [8, 9, 10]) {
    const cell = window.XLSX.utils.encode_cell({ r, c: 1 });
    summaryWs[cell].z = RUPEE_FORMAT;
  }
  window.XLSX.utils.book_append_sheet(wb, summaryWs, "Summary");

  for (const fy of FINANCIAL_YEARS) {
    const rows: (string | number)[][] = sortedDistricts.map((d) => {
      const match = pacData.find((p) => p.districtId === d.id && p.financialYear === fy);
      const net = netRecoverable(match?.grossArrears ?? 0, match?.recoveredAmount ?? 0, match?.stayAmount ?? 0);
      return [d.districtName, ...PAC_FIELD_ORDER.map((field) => match?.[field] ?? 0), net];
    });

    const totalRow: (string | number)[] = ["TOTAL"];
    for (let col = 1; col < header.length; col++) {
      totalRow.push(rows.reduce((sum, row) => sum + (Number(row[col]) || 0), 0));
    }

    const ws = window.XLSX.utils.aoa_to_sheet([
      [`${SITE_TITLE_EN} — FY ${fy}`],
      [dataPeriodForFY(fy)],
      header,
      ...rows,
      totalRow,
    ]);
    ws["!cols"] = [{ wch: 22 }, ...PAC_FIELD_ORDER.map(() => ({ wch: 18 })), { wch: 18 }];
    // Title/data-period rows only occupy column A; merge them across the full table width so
    // they read as a banner instead of a truncated cell next to empty ones. "Merge & center" in
    // Excel is really just centering the top-left cell of the merge — the other cells in the
    // range are hidden underneath it — so only that one cell needs the alignment style below.
    ws["!merges"] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: header.length - 1 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: header.length - 1 } },
    ];
    ws["A1"].s = { font: { bold: true, sz: 14 }, alignment: { horizontal: "center", vertical: "center" } };
    ws["A2"].s = { font: { italic: true, sz: 11 }, alignment: { horizontal: "center", vertical: "center" } };

    // Header row: white-on-blue, bold, centered, wrapping (labels are long enough to need it).
    for (let c = 0; c < header.length; c++) {
      const cell = window.XLSX.utils.encode_cell({ r: TITLE_ROWS, c });
      ws[cell].s = {
        font: { bold: true, color: { rgb: "FFFFFF" } },
        fill: { fgColor: { rgb: HEADER_FILL } },
        alignment: { horizontal: "center", vertical: "center", wrapText: true },
      };
    }

    const totalDataRows = rows.length + 1; // header row is row 0 pre-shift
    for (let r = 1; r <= totalDataRows; r++) {
      for (const c of moneyColumns) {
        const cell = window.XLSX.utils.encode_cell({ r: r + TITLE_ROWS, c });
        if (ws[cell]) ws[cell].z = RUPEE_FORMAT;
      }
    }

    // TOTAL row (footer): bold on a soft blue tint, distinguishing it from the plain data rows
    // above it without the heavier blue used on the header.
    const totalRowIndex = TITLE_ROWS + totalDataRows;
    for (let c = 0; c < header.length; c++) {
      const cell = window.XLSX.utils.encode_cell({ r: totalRowIndex, c });
      ws[cell].s = { font: { bold: true }, fill: { fgColor: { rgb: TOTAL_FILL } } };
    }

    // ponytail: neither the stock SheetJS Community build nor xlsx-js-style (which only patches
    // in cell-style writing, see HEADER_FILL/TOTAL_FILL above) writes frozen-pane XML — this line
    // is still a no-op. Confirmed by inspecting xl/worksheets/sheet1.xml from a real build: no
    // <pane> element, even with styles genuinely present elsewhere in the same file. True frozen
    // rows/columns need SheetJS Pro; !xlnm.Print_Titles below is the closest free substitute
    // (repeats these rows on every *printed* page, not on-screen scroll).
    (ws as unknown as Record<string, unknown>)["!freeze"] = { xSplit: 1, ySplit: 1 + TITLE_ROWS };

    // Sheet names can't contain "/" — financial years use it (e.g. "2021-22" is fine, but
    // guard generically in case that ever changes).
    const sheetName = `FY ${fy}`.replace(/\//g, "-");
    const sheetIndex = wb.SheetNames.length;
    window.XLSX.utils.book_append_sheet(wb, ws, sheetName);
    printTitleNames.push({
      Name: "_xlnm.Print_Titles",
      Sheet: sheetIndex,
      Ref: `'${sheetName}'!$1:$${TITLE_ROWS + 1}`,
    });
  }

  wb.Workbook = { Names: printTitleNames };
  window.XLSX.writeFile(wb, `excise-revenue-recovery-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

// Template for bulk DEO provisioning (frontend/app/admin/page.tsx's Upload DEO Data). Column A
// is pre-filled with all 75 seeded district names, alphabetical, exactly as stored in
// api/drizzle/seed.sql (already Title Case) — the admin only needs to type into columns B/C
// and re-upload. Column order here must match the array-of-arrays parsing in
// parseDeoTemplateFile below.
export function downloadDeoTemplate(districts: CachedDistrict[]) {
  const header = ["District Name", "DEO CUG Mobile (10 digits)", "DEO Email (optional)"];
  const sortedNames = [...districts].map((d) => d.districtName).sort((a, b) => a.localeCompare(b));
  const rows = sortedNames.map((name) => [name, "", ""]);

  const ws = window.XLSX.utils.aoa_to_sheet([header, ...rows]);
  ws["!cols"] = [{ wch: 24 }, { wch: 26 }, { wch: 30 }];

  const wb = window.XLSX.utils.book_new();
  window.XLSX.utils.book_append_sheet(wb, ws, "DEO Provisioning");
  window.XLSX.writeFile(wb, "deo-provisioning-template.xlsx");
}

function sqlLiteral(v: string | number | null): string {
  if (v === null) return "NULL";
  if (typeof v === "number") return String(v);
  return `'${v.replace(/'/g, "''")}'`;
}

// Plain-text SQL restore script for the two tables the admin panel actually caches client-side
// (districts, pac_data) — not users/audit_log/magic_link_tokens, which never leave the API. This
// is a backup/restore aid for the admin, not a full DB dump; column names/order match
// api/db/schema.ts exactly so the file can be piped straight into `wrangler d1 execute` if ever
// needed. Uses a plain Blob + anchor download — no new dependency, unlike the .xlsx export which
// genuinely needs SheetJS for its binary format.
export function exportDistrictsToSql(districts: CachedDistrict[], pacData: CachedPacData[]) {
  const lines: string[] = [
    `-- ${SITE_TITLE_EN}`,
    `-- SQL backup generated ${new Date().toISOString()} (UTC)`,
    `-- Covers districts + pac_data only (the tables cached in the admin panel) —`,
    `-- not users, audit_log, or magic_link_tokens.`,
    "",
    "DELETE FROM pac_data;",
    "DELETE FROM districts;",
    "",
  ];

  for (const d of [...districts].sort((a, b) => a.id - b.id)) {
    lines.push(
      `INSERT INTO districts (id, district_name, lock_status, unlocked_at, unlock_reason, unlocked_by) VALUES ` +
        `(${d.id}, ${sqlLiteral(d.districtName)}, ${d.lockStatus}, ${sqlLiteral(d.unlockedAt)}, ${sqlLiteral(d.unlockReason)}, ${sqlLiteral(d.unlockedBy)});`
    );
  }
  lines.push("");

  for (const p of [...pacData].sort((a, b) => a.id - b.id)) {
    lines.push(
      `INSERT INTO pac_data (id, district_id, financial_year, gross_arrears, rc_count, rc_amount, recovered_amount, stay_count, stay_amount, submitted_by_name, locked_at) VALUES ` +
        `(${p.id}, ${p.districtId}, ${sqlLiteral(p.financialYear)}, ${p.grossArrears}, ${p.rcCount}, ${p.rcAmount}, ${p.recoveredAmount}, ${p.stayCount}, ${p.stayAmount}, ${sqlLiteral(p.submittedByName)}, ${sqlLiteral(p.lockedAt)});`
    );
  }

  const blob = new Blob([lines.join("\n") + "\n"], { type: "application/sql" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `excise-revenue-recovery-${new Date().toISOString().slice(0, 10)}.sql`;
  a.click();
  URL.revokeObjectURL(url);
}

export type DeoTemplateRow = { districtName: string; cugMobile: string; email: string };

// Reads back whatever downloadDeoTemplate produced (or the admin's edited copy of it) —
// deliberately positional (column A/B/C), not header-name matching, so it still works if the
// admin retypes/retranslates the header row's wording.
export function parseDeoTemplateFile(workbook: ReturnType<typeof window.XLSX.read>): DeoTemplateRow[] {
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const aoa = window.XLSX.utils.sheet_to_json<(string | number)[]>(sheet, { header: 1 });
  return aoa
    .slice(1) // skip header row
    .map((row) => ({
      districtName: String(row[0] ?? "").trim(),
      cugMobile: String(row[1] ?? "").trim(),
      email: String(row[2] ?? "").trim(),
    }))
    .filter((row) => row.districtName);
}
