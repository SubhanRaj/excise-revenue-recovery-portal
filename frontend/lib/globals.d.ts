import type SwalType from "sweetalert2";
import type * as XLSXType from "xlsx";
import type { Chart as ChartType } from "chart.js";

declare global {
  interface Window {
    Swal: typeof SwalType;
    XLSX: typeof XLSXType;
    Chart: typeof ChartType;
  }
}
