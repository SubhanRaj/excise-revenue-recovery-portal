import { FINANCIAL_YEARS, PAC_FIELD_ORDER, PAC_FIELD_LABELS, isMoneyField, netRecoverable } from "./pac-fields";
import { SITE_TITLE_EN, DATA_PERIOD_EN } from "./site";
import type { CachedDistrict, CachedPacData } from "./db";

const RUPEE_FORMAT = '"₹"#,##0.00';
// Two extra rows (title + data period) sit above the header row on every sheet — everything
// below (header row, money-cell formatting, totals) shifts down by this many rows accordingly.
const TITLE_ROWS = 2;

// One workbook, one sheet per financial year (5 sheets) — each sheet is districts × the 6 PAC
// fields for just that year, rather than one sheet with all 5 years' columns side by side.
export function exportDistrictsToXlsx(districts: CachedDistrict[], pacData: CachedPacData[]) {
  const sortedDistricts = [...districts].sort((a, b) => a.districtName.localeCompare(b.districtName));
  // Net Recoverable is a derived, never-persisted value (see pac-fields.ts) — appended as its
  // own trailing column here rather than looped in via PAC_FIELD_ORDER, same as it's rendered
  // as its own extra row (not a 7th PAC_FIELD_ORDER entry) everywhere else it's shown.
  const header = ["District", ...PAC_FIELD_ORDER.map((f) => PAC_FIELD_LABELS[f]), "Net Recoverable / शुद्ध वसूली योग्य धनराशि"];
  const netRecoverableCol = header.length - 1;
  const moneyColumns = [
    ...PAC_FIELD_ORDER.map((field, i) => (isMoneyField(field) ? i + 1 : -1)).filter((c) => c >= 0),
    netRecoverableCol,
  ];

  const wb = window.XLSX.utils.book_new();

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
      [DATA_PERIOD_EN],
      header,
      ...rows,
      totalRow,
    ]);
    ws["!cols"] = [{ wch: 22 }, ...PAC_FIELD_ORDER.map(() => ({ wch: 18 })), { wch: 18 }];
    // Title/data-period rows only occupy column A; merge them across the full table width so
    // they read as a banner instead of a truncated cell next to empty ones.
    ws["!merges"] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: header.length - 1 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: header.length - 1 } },
    ];

    const totalDataRows = rows.length + 1; // header row is row 0 pre-shift
    for (let r = 1; r <= totalDataRows; r++) {
      for (const c of moneyColumns) {
        const cell = window.XLSX.utils.encode_cell({ r: r + TITLE_ROWS, c });
        if (ws[cell]) ws[cell].z = RUPEE_FORMAT;
      }
    }

    // ponytail: SheetJS Community (the free CDN build) can't write frozen panes — that's a
    // Pro-only feature. This line is a no-op today; upgrade to SheetJS Pro to make it real.
    (ws as unknown as Record<string, unknown>)["!freeze"] = { xSplit: 1, ySplit: 1 + TITLE_ROWS };

    // Sheet names can't contain "/" — financial years use it (e.g. "2021-22" is fine, but
    // guard generically in case that ever changes).
    window.XLSX.utils.book_append_sheet(wb, ws, `FY ${fy}`.replace(/\//g, "-"));
  }

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
