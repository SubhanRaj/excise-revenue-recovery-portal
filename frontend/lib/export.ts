import { FINANCIAL_YEARS, PAC_FIELD_ORDER, PAC_FIELD_LABELS, isMoneyField } from "./pac-fields";
import type { CachedDistrict, CachedPacData } from "./db";

const RUPEE_FORMAT = '"₹"#,##0.00';

// One workbook, one sheet per financial year (5 sheets) — each sheet is districts × the 6 PAC
// fields for just that year, rather than one sheet with all 5 years' columns side by side.
export function exportDistrictsToXlsx(districts: CachedDistrict[], pacData: CachedPacData[]) {
  const sortedDistricts = [...districts].sort((a, b) => a.districtName.localeCompare(b.districtName));
  const header = ["District", ...PAC_FIELD_ORDER.map((f) => PAC_FIELD_LABELS[f])];
  const moneyColumns = PAC_FIELD_ORDER.map((field, i) => (isMoneyField(field) ? i + 1 : -1)).filter((c) => c >= 0);

  const wb = window.XLSX.utils.book_new();

  for (const fy of FINANCIAL_YEARS) {
    const rows: (string | number)[][] = sortedDistricts.map((d) => {
      const match = pacData.find((p) => p.districtId === d.id && p.financialYear === fy);
      return [d.districtName, ...PAC_FIELD_ORDER.map((field) => match?.[field] ?? 0)];
    });

    const totalRow: (string | number)[] = ["TOTAL"];
    for (let col = 1; col < header.length; col++) {
      totalRow.push(rows.reduce((sum, row) => sum + (Number(row[col]) || 0), 0));
    }

    const ws = window.XLSX.utils.aoa_to_sheet([header, ...rows, totalRow]);
    ws["!cols"] = [{ wch: 22 }, ...PAC_FIELD_ORDER.map(() => ({ wch: 18 }))];

    const totalDataRows = rows.length + 1; // header row is row 0
    for (let r = 1; r <= totalDataRows; r++) {
      for (const c of moneyColumns) {
        const cell = window.XLSX.utils.encode_cell({ r, c });
        if (ws[cell]) ws[cell].z = RUPEE_FORMAT;
      }
    }

    // ponytail: SheetJS Community (the free CDN build) can't write frozen panes — that's a
    // Pro-only feature. This line is a no-op today; upgrade to SheetJS Pro to make it real.
    (ws as unknown as Record<string, unknown>)["!freeze"] = { xSplit: 1, ySplit: 1 };

    // Sheet names can't contain "/" — financial years use it (e.g. "2021-22" is fine, but
    // guard generically in case that ever changes).
    window.XLSX.utils.book_append_sheet(wb, ws, fy.replace(/\//g, "-"));
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
