import type SwalType from "sweetalert2";
import type * as XLSXType from "xlsx";

declare global {
  interface Window {
    Swal: typeof SwalType;
    XLSX: typeof XLSXType;
  }
}
