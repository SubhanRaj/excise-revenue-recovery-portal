import type SwalType from "sweetalert2";
// xlsx-js-style, not the stock "xlsx" package — see export.ts for why (it's the same SheetJS
// Community core plus real cell-style/`.s` write support the stock free build silently drops).
import type * as XLSXType from "xlsx-js-style";
import type { Chart as ChartType } from "chart.js";

declare global {
  interface Window {
    Swal: typeof SwalType;
    XLSX: typeof XLSXType;
    Chart: typeof ChartType;
  }
}
