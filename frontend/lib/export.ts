import { FINANCIAL_YEARS, PAC_FIELD_ORDER, PAC_FIELD_LABELS, isMoneyField } from "./pac-fields";
import type { CachedDistrict, CachedPacData } from "./db";

const RUPEE_FORMAT = '"₹"#,##0.00';

export function exportDistrictsToXlsx(districts: CachedDistrict[], pacData: CachedPacData[]) {
  const header = ["District"];
  for (const fy of FINANCIAL_YEARS) {
    for (const field of PAC_FIELD_ORDER) header.push(`${fy} — ${PAC_FIELD_LABELS[field]}`);
  }

  const sortedDistricts = [...districts].sort((a, b) => a.districtName.localeCompare(b.districtName));
  const rows: (string | number)[][] = sortedDistricts.map((d) => {
    const row: (string | number)[] = [d.districtName];
    for (const fy of FINANCIAL_YEARS) {
      const match = pacData.find((p) => p.districtId === d.id && p.financialYear === fy);
      for (const field of PAC_FIELD_ORDER) row.push(match?.[field] ?? 0);
    }
    return row;
  });

  const totalRow: (string | number)[] = ["TOTAL"];
  for (let col = 1; col < header.length; col++) {
    totalRow.push(rows.reduce((sum, row) => sum + (Number(row[col]) || 0), 0));
  }

  const ws = window.XLSX.utils.aoa_to_sheet([header, ...rows, totalRow]);

  // Indian Rupee number format on every money column (skip the district name column).
  const moneyColumns = FINANCIAL_YEARS.flatMap((_, yearIdx) =>
    PAC_FIELD_ORDER.map((field, fieldIdx) => (isMoneyField(field) ? 1 + yearIdx * PAC_FIELD_ORDER.length + fieldIdx : -1))
  ).filter((c) => c >= 0);

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

  const wb = window.XLSX.utils.book_new();
  window.XLSX.utils.book_append_sheet(wb, ws, "PAC Data");
  window.XLSX.writeFile(wb, `excise-revenue-recovery-${new Date().toISOString().slice(0, 10)}.xlsx`);
}
