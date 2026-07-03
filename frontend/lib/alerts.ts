// SweetAlert2 loaded via CDN (see app/layout.tsx) — strictly no native window.alert/confirm.
export function alertBlankField() {
  return window.Swal.fire({
    icon: "error",
    title: "Error",
    // Mandated verbatim by the portal's data-entry spec — do not translate or shorten.
    text: "कृपया रिक्त स्थान छोड़ें नहीं। यदि कोई बकाया/वसूली नहीं है, तो अनिवार्य रूप से 0 दर्ज करें। (Please do not leave the field blank — enter 0 if there is no due/recovery.)",
    confirmButtonText: "OK",
  });
}

export function alertError(message: string) {
  return window.Swal.fire({ icon: "error", title: "Error", text: message, confirmButtonText: "OK" });
}

export function alertSuccess(message: string) {
  return window.Swal.fire({ icon: "success", title: "Success", text: message, confirmButtonText: "OK" });
}

export async function confirmFinalSubmit(): Promise<boolean> {
  const result = await window.Swal.fire({
    icon: "warning",
    title: "Are you sure?",
    text: "Once submitted, the data will be locked and cannot be edited again.",
    showCancelButton: true,
    confirmButtonText: "Yes, Submit",
    cancelButtonText: "Cancel",
    confirmButtonColor: "#dc2626",
  });
  return result.isConfirmed;
}
