// Portal identity strings shared by the browser tab title/meta description (layout.tsx), the
// login page, the DEO title bar (deo-data-entry/page.tsx), and the Excel export title rows
// (export.ts) — kept in one place so all four stay in sync instead of drifting copies.
export const SITE_TITLE_EN = "Recovery Certificates (RCs) Issued for Recovery of Excise Revenue Arrears";
export const SITE_TITLE_HI = "उत्पाद शुल्क राजस्व बकाया की वसूली हेतु जारी वसूली प्रमाण पत्र (आर.सी.)";

// Mirrors the first/last entries of FINANCIAL_YEARS (pac-fields.ts): "2021-22" starts 1 April
// 2021, "2025-26" ends 31 March 2026. Written out by hand rather than derived, same as every
// other place FINANCIAL_YEARS-adjacent text is duplicated in this app — update both if the
// 5-year window ever shifts.
export const DATA_PERIOD_EN = "Data Period: 1 April 2021 to 31 March 2026";
export const DATA_PERIOD_HI = "डेटा अवधि: 1 अप्रैल 2021 से 31 मार्च 2026 तक";
