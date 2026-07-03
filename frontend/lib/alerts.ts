// SweetAlert2 loaded via CDN (see app/layout.tsx) — strictly no native window.alert/confirm.
// Reserved for the one interaction that actually warrants a blocking modal: confirming an
// irreversible action. Everything else (validation, errors, success) is inline SPA state —
// see components/ui/Banner.tsx — not a popup.
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
