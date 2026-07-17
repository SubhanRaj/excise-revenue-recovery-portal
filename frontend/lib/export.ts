import type { Workbook, Cell } from "exceljs";
import { FINANCIAL_YEARS, PAC_FIELD_ORDER, PAC_FIELD_LABELS, OPENING_BALANCE_LABEL, isMoneyField, englishLabel } from "./pac-fields";
import { SITE_TITLE_EN, DATA_PERIOD_EN } from "./site";
import { formatIST } from "./format";
import type { CachedDistrict, CachedPacData } from "./db";

const RUPEE_FORMAT = '"₹"#,##0.00';
// Two extra rows (title + data period) sit above the header row on every sheet — everything
// below (header row, money-cell formatting, totals, and the frozen/print-titles row count)
// shifts down by this many rows accordingly.
const TITLE_ROWS = 2;

// Same brand blue as the rest of the app (see "Visual language" in CLAUDE.md — blue-700/blue-600,
// the hex equivalents already used for the magic-link email) and a soft blue-100 tint for the
// total row, so this file reads as this portal's own rather than a bare, unstyled data dump.
// ExcelJS ARGB colors need a leading alpha channel — "FF" (fully opaque) here.
const HEADER_FILL = "FF1D4ED8";
const TOTAL_FILL = "FFDBEAFE";

// Applied to every sheet in every exported workbook: A4 (ExcelJS/OOXML paper size code 9, not
// the US Letter default), landscape (these tables are wide — districts × 6 PAC fields + Net
// Recoverable), and fitToWidth: 1 / fitToHeight: 0 so all columns always print on one page's
// width while rows are free to spill onto as many pages as needed (fitToHeight: 0 means "no
// limit" — the actual multi-page-by-rows behavior being asked for).
const PAGE_SETUP = {
  paperSize: 9,
  orientation: "landscape",
  fitToPage: true,
  fitToWidth: 1,
  fitToHeight: 0,
} as const;

function styleTitleCell(cell: Cell) {
  cell.font = { bold: true, size: 14 };
  cell.alignment = { horizontal: "center", vertical: "middle" };
}

function styleSubtitleCell(cell: Cell) {
  cell.font = { italic: true, size: 11 };
  cell.alignment = { horizontal: "center", vertical: "middle" };
}

function styleHeaderCell(cell: Cell) {
  cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
  cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
}

function styleTotalCell(cell: Cell) {
  cell.font = { bold: true };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TOTAL_FILL } };
}

// This export is read by auditors/senior officers/commissioners, not DEOs — unlike the rest of
// the app, PAC_FIELD_LABELS' Hindi half (there for the government form DEOs fill out) isn't
// needed here, so every label is trimmed to its English half before it reaches a sheet.
// Filename-safe IST timestamp down to the second (e.g. "2026-07-05_20-14-32") — the previous
// plain `toISOString().slice(0, 10)` only gave the UTC date, which collapsed every export
// downloaded on the same IST day into one filename; this distinguishes re-downloads on the same
// day and, since it's IST, matches the "Generated: ... IST" line on the Summary sheet rather
// than a UTC date that can be a day off from what's shown inside the file. ":" isn't valid in
// Windows filenames, hence "-" as the time separator.
function istFilenameStamp(): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}_${get("hour")}-${get("minute")}-${get("second")}`;
}

type RcDetail = { rcNumber: string; rcAmount: number; stayed: boolean };

// Lenient — this reads a value the server already validated at submit time (see
// api/lib/rc-details.ts), not a fresh zero-trust boundary.
function parseRcDetails(raw: string | undefined): RcDetail[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
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

// Downloads any ExcelJS workbook as a real .xlsx file — writeBuffer() is the browser-safe way to
// get bytes out of ExcelJS (there's no writeFile() outside Node), so every export funnels through
// this one Blob + anchor-click helper instead of each call site re-implementing the download.
async function downloadWorkbook(wb: InstanceType<typeof window.ExcelJS.Workbook>, filename: string) {
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// One workbook: a Summary cover sheet, then one sheet per financial year (5 sheets) — each FY
// sheet is districts × the 6 PAC fields for just that year, rather than one sheet with all 5
// years' columns side by side.
export async function exportDistrictsToXlsx(districts: CachedDistrict[], pacData: CachedPacData[]) {
  const sortedDistricts = [...districts].sort((a, b) => a.districtName.localeCompare(b.districtName));
  // Opening Balance/Net Recoverable are read straight off pac_data (computed server-side at
  // submit time — see CLAUDE.md's Data model section), not recomputed here — not looped in via
  // PAC_FIELD_ORDER since neither is a DEO-entered field. Opening Balance leads (right after
  // District, matching the admin districts table/Master View convention of showing it first);
  // Net Recoverable stays a trailing column, the running result after all 6 fields.
  const header = [
    "District",
    englishLabel(OPENING_BALANCE_LABEL),
    ...PAC_FIELD_ORDER.map((f) => englishLabel(PAC_FIELD_LABELS[f])),
    "Net Recoverable",
  ];
  const openingBalanceCol = 1; // 0-based
  const netRecoverableCol = header.length - 1; // 0-based
  const moneyColumns = [
    openingBalanceCol,
    ...PAC_FIELD_ORDER.map((field, i) => (isMoneyField(field) ? i + 2 : -1)).filter((c) => c >= 0),
    netRecoverableCol,
  ];

  const wb = new window.ExcelJS.Workbook();
  // One shared timestamp for the whole workbook — this is when the download actually happened,
  // in real IST (formatIST(), not toLocaleString("en-IN") alone, which silently uses the
  // browser's own local zone instead).
  const generatedAt = formatIST(new Date().toISOString());

  // Summary cover sheet, added first so it's the first thing the reader sees — when the file was
  // generated and a workbook-wide lock/revenue overview — rather than repeating a generated-at
  // row on all 5 per-FY sheets. Gross Arrears/Recovered Amount are summed across every district
  // and all 5 FINANCIAL_YEARS, same "whole 5-year window" convention the Admin Dashboard's own
  // KPI cards use for these two fields (see admin/page.tsx). Net Recoverable is NOT summed across
  // years — each FY's value already includes every prior year's carried-forward balance, so
  // summing all 5 would double-count it (see CLAUDE.md's Data model section); instead this sums
  // every district's FY 2025-26 (final year) value, "total outstanding as of 31 March 2026."
  let totalGrossArrears = 0;
  let totalRecovered = 0;
  let totalNetRecoverable = 0;
  const finalFy = FINANCIAL_YEARS[FINANCIAL_YEARS.length - 1];
  for (const d of districts) {
    for (const fy of FINANCIAL_YEARS) {
      const match = pacData.find((p) => p.districtId === d.id && p.financialYear === fy);
      totalGrossArrears += match?.grossArrears ?? 0;
      totalRecovered += match?.recoveredAmount ?? 0;
    }
    const finalYearMatch = pacData.find((p) => p.districtId === d.id && p.financialYear === finalFy);
    totalNetRecoverable += finalYearMatch?.netRecoverable ?? 0;
  }
  const lockedCount = districts.filter((d) => d.lockStatus === 1).length;

  const summaryWs = wb.addWorksheet("Summary", { pageSetup: PAGE_SETUP });
  summaryWs.columns = [{ width: 32 }, { width: 40 }];
  summaryWs.addRow([SITE_TITLE_EN]);
  summaryWs.addRow([DATA_PERIOD_EN]);
  summaryWs.addRow([`Generated: ${generatedAt} IST`]);
  summaryWs.addRow([]);
  const summaryHeaderRow = summaryWs.addRow(["Metric", "Value"]);
  summaryWs.addRow(["Total Districts", districts.length]);
  summaryWs.addRow(["Locked Districts", lockedCount]);
  summaryWs.addRow(["Unlocked Districts", districts.length - lockedCount]);
  const grossRow = summaryWs.addRow(["Total Gross Arrears (all 5 years)", totalGrossArrears]);
  const recoveredRow = summaryWs.addRow(["Total Recovered Amount (all 5 years)", totalRecovered]);
  const netRow = summaryWs.addRow(["Total Net Recoverable (as of 31 March 2026)", totalNetRecoverable]);
  summaryWs.addRow([]);
  summaryWs.addRow(["Sheets in this workbook", FINANCIAL_YEARS.map((fy) => `FY ${fy}`).join(", ")]);

  summaryWs.mergeCells(1, 1, 1, 2);
  summaryWs.mergeCells(2, 1, 2, 2);
  summaryWs.mergeCells(3, 1, 3, 2);
  styleTitleCell(summaryWs.getCell(1, 1));
  styleSubtitleCell(summaryWs.getCell(2, 1));
  summaryWs.getCell(3, 1).font = { italic: true, size: 10, color: { argb: "FF64748B" } };
  summaryWs.getCell(3, 1).alignment = { horizontal: "center", vertical: "middle" };
  summaryHeaderRow.eachCell((cell) => styleHeaderCell(cell));
  for (const row of [grossRow, recoveredRow, netRow]) {
    row.getCell(2).numFmt = RUPEE_FORMAT;
  }

  for (const fy of FINANCIAL_YEARS) {
    const rows: (string | number)[][] = sortedDistricts.map((d) => {
      const match = pacData.find((p) => p.districtId === d.id && p.financialYear === fy);
      return [
        d.districtName,
        match?.openingBalance ?? 0,
        ...PAC_FIELD_ORDER.map((field) => match?.[field] ?? 0),
        match?.netRecoverable ?? 0,
      ];
    });

    const totalRowValues: (string | number)[] = ["TOTAL"];
    for (let col = 1; col < header.length; col++) {
      totalRowValues.push(rows.reduce((sum, row) => sum + (Number(row[col]) || 0), 0));
    }

    // Sheet names can't contain "/" — financial years use it (e.g. "2021-22" is fine, but
    // guard generically in case that ever changes).
    const sheetName = `FY ${fy}`.replace(/\//g, "-");
    const ws = wb.addWorksheet(sheetName, {
      // Freezes the title/data-period/header rows (rows 1..TITLE_ROWS+1) on screen — real
      // frozen panes, unlike the SheetJS builds tried before ExcelJS (neither the stock "xlsx"
      // package nor the "xlsx-js-style" fork write frozen-pane XML at all; confirmed empty
      // <sheetView> in both). ExcelJS's writer genuinely emits the <pane> element Excel needs.
      views: [{ state: "frozen", ySplit: TITLE_ROWS + 1 }],
      // _xlnm.Print_Titles — repeats the same rows on every *printed* page too, on top of the
      // shared A4/landscape/fit-to-width page setup.
      pageSetup: { ...PAGE_SETUP, printTitlesRow: `1:${TITLE_ROWS + 1}` },
    });
    ws.columns = [{ width: 22 }, { width: 18 }, ...PAC_FIELD_ORDER.map(() => ({ width: 18 })), { width: 18 }];

    ws.addRow([`${SITE_TITLE_EN} — FY ${fy}`]);
    ws.addRow([dataPeriodForFY(fy)]);
    const headerRow = ws.addRow(header);
    const dataRows = rows.map((r) => ws.addRow(r));
    const totalRow = ws.addRow(totalRowValues);

    // Title/data-period rows only occupy column A; merge them across the full table width so
    // they read as a banner instead of a truncated cell next to empty ones. "Merge & center" in
    // Excel is really just centering the top-left cell of the merge — the other cells in the
    // range are hidden underneath it — so only that one cell needs the alignment style.
    ws.mergeCells(1, 1, 1, header.length);
    ws.mergeCells(2, 1, 2, header.length);
    styleTitleCell(ws.getCell(1, 1));
    styleSubtitleCell(ws.getCell(2, 1));

    // Header row: white-on-blue, bold, centered, wrapping (labels are long enough to need it).
    headerRow.eachCell((cell) => styleHeaderCell(cell));

    // Money columns (0-based) map 1:1 onto ExcelJS's 1-based columns (col c here == c + 1 there).
    for (const row of dataRows) {
      for (const c of moneyColumns) row.getCell(c + 1).numFmt = RUPEE_FORMAT;
    }
    for (const c of moneyColumns) totalRow.getCell(c + 1).numFmt = RUPEE_FORMAT;

    // TOTAL row (footer): bold on a soft blue tint, distinguishing it from the plain data rows
    // above it without the heavier blue used on the header.
    totalRow.eachCell((cell) => styleTotalCell(cell));
  }

  // Full per-RC breakdown, one row per RC (not summarized) — an auditor needs every individual
  // RC's number/amount/stay status, not just the FY-level rcAmount total already on each FY
  // sheet above. One flat sheet across all districts/FYs (rather than a sheet per FY) since a
  // district's RC count varies per FY and a flat table sorts/filters more usefully than five
  // sparse per-FY sheets would.
  const rcRows: (string | number)[][] = [];
  for (const d of sortedDistricts) {
    for (const fy of FINANCIAL_YEARS) {
      const match = pacData.find((p) => p.districtId === d.id && p.financialYear === fy);
      const details = parseRcDetails(match?.rcDetails);
      for (const rc of details) {
        rcRows.push([d.districtName, `FY ${fy}`, rc.rcNumber, rc.rcAmount, rc.stayed ? "Yes" : "No"]);
      }
    }
  }
  const rcHeader = ["District", "Financial Year", "RC Number", "RC Amount", "Stayed"];
  const rcWs = wb.addWorksheet("RC Details", {
    views: [{ state: "frozen", ySplit: TITLE_ROWS + 1 }],
    pageSetup: { ...PAGE_SETUP, printTitlesRow: `1:${TITLE_ROWS + 1}` },
  });
  rcWs.columns = [{ width: 22 }, { width: 14 }, { width: 24 }, { width: 18 }, { width: 10 }];
  rcWs.addRow([`${SITE_TITLE_EN} — RC Details`]);
  rcWs.addRow([DATA_PERIOD_EN]);
  rcWs.mergeCells(1, 1, 1, rcHeader.length);
  rcWs.mergeCells(2, 1, 2, rcHeader.length);
  styleTitleCell(rcWs.getCell(1, 1));
  styleSubtitleCell(rcWs.getCell(2, 1));
  const rcHeaderRow = rcWs.addRow(rcHeader);
  rcHeaderRow.eachCell((cell) => styleHeaderCell(cell));
  for (const row of rcRows) {
    const excelRow = rcWs.addRow(row);
    excelRow.getCell(4).numFmt = RUPEE_FORMAT;
  }
  if (rcRows.length === 0) {
    rcWs.addRow(["No RCs recorded across any district/FY."]);
  }

  await downloadWorkbook(wb, `excise-revenue-recovery-${istFilenameStamp()}.xlsx`);
}

// Template for bulk DEO provisioning (frontend/app/admin/page.tsx's Upload DEO Data). Column A
// is pre-filled with all 75 seeded district names, alphabetical, exactly as stored in
// api/drizzle/seed.sql (already Title Case) — the admin only needs to type into columns B/C
// and re-upload. Column order here must match the array-of-arrays parsing in
// parseDeoTemplateFile below.
export async function downloadDeoTemplate(districts: CachedDistrict[]) {
  const header = ["District Name", "DEO CUG Mobile (10 digits)", "DEO Email (optional)"];
  const sortedNames = [...districts].map((d) => d.districtName).sort((a, b) => a.localeCompare(b));

  const wb = new window.ExcelJS.Workbook();
  const ws = wb.addWorksheet("DEO Provisioning", { pageSetup: PAGE_SETUP });
  ws.columns = [{ width: 24 }, { width: 26 }, { width: 30 }];
  ws.addRow(header);
  for (const name of sortedNames) ws.addRow([name, "", ""]);

  await downloadWorkbook(wb, "deo-provisioning-template.xlsx");
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
// needed. Uses a plain Blob + anchor download — no ExcelJS needed, unlike the .xlsx exports above.
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
      `INSERT INTO pac_data (id, district_id, financial_year, gross_arrears, rc_count, rc_amount, rc_details, recovered_amount, stay_count, stay_amount, opening_balance, net_recoverable, submitted_by_name, locked_at) VALUES ` +
        `(${p.id}, ${p.districtId}, ${sqlLiteral(p.financialYear)}, ${p.grossArrears}, ${p.rcCount}, ${p.rcAmount}, ${sqlLiteral(p.rcDetails)}, ${p.recoveredAmount}, ${p.stayCount}, ${p.stayAmount}, ${p.openingBalance}, ${p.netRecoverable}, ${sqlLiteral(p.submittedByName)}, ${sqlLiteral(p.lockedAt)});`
    );
  }

  const blob = new Blob([lines.join("\n") + "\n"], { type: "application/sql" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `excise-revenue-recovery-${istFilenameStamp()}.sql`;
  a.click();
  URL.revokeObjectURL(url);
}

export type DeoTemplateRow = { districtName: string; cugMobile: string; email: string };

// Reads back whatever downloadDeoTemplate produced (or the admin's edited copy of it) —
// deliberately positional (column A/B/C), not header-name matching, so it still works if the
// admin retypes/retranslates the header row's wording.
export function parseDeoTemplateFile(workbook: Workbook): DeoTemplateRow[] {
  const sheet = workbook.worksheets[0];
  const result: DeoTemplateRow[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // skip header row
    const districtName = String(row.getCell(1).value ?? "").trim();
    if (!districtName) return;
    result.push({
      districtName,
      cugMobile: String(row.getCell(2).value ?? "").trim(),
      email: String(row.getCell(3).value ?? "").trim(),
    });
  });
  return result;
}
