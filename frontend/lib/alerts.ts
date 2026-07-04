// SweetAlert2 loaded via CDN (see app/layout.tsx) — strictly no native window.alert/confirm.
// Reserved for interactions that warrant a blocking modal (irreversible actions, logout) and
// brief auth-transition toasts (modeled on the sibling excise-bakaya-record project's
// `toast: true, position: 'top-end'` pattern). Everything else (validation, routine
// errors/success) is inline SPA state — see components/ui/Banner.tsx — not a popup.
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

export async function confirmLogout(): Promise<boolean> {
  const result = await window.Swal.fire({
    icon: "question",
    title: "Log out?",
    text: "You'll need to sign in again to continue.",
    showCancelButton: true,
    confirmButtonText: "Yes, Logout",
    cancelButtonText: "Cancel",
    confirmButtonColor: "#4f46e5",
  });
  return result.isConfirmed;
}

// Fire-and-forget corner toast for auth transitions (login/logout). Not awaited by callers —
// its DOM node attaches to <body>, outside the React tree, so it survives the client-side
// route change that typically follows (e.g. logout redirecting to /login).
export function notifyToast(opts: { icon: "success" | "info" | "error"; title: string }) {
  window.Swal.fire({
    toast: true,
    position: "top-end",
    icon: opts.icon,
    title: opts.title,
    showConfirmButton: false,
    timer: 2000,
    timerProgressBar: true,
  });
}
