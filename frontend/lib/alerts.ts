// SweetAlert2 loaded via CDN (see app/layout.tsx) — strictly no native window.alert/confirm.
export function alertBlankField() {
  return window.Swal.fire({
    icon: "error",
    title: "त्रुटि",
    text: "कृपया रिक्त स्थान छोड़ें नहीं। यदि कोई बकाया/वसूली नहीं है, तो अनिवार्य रूप से 0 दर्ज करें।",
    confirmButtonText: "ठीक है",
  });
}

export function alertError(message: string) {
  return window.Swal.fire({ icon: "error", title: "त्रुटि", text: message, confirmButtonText: "ठीक है" });
}

export function alertSuccess(message: string) {
  return window.Swal.fire({ icon: "success", title: "सफल", text: message, confirmButtonText: "ठीक है" });
}

export async function confirmFinalSubmit(): Promise<boolean> {
  const result = await window.Swal.fire({
    icon: "warning",
    title: "क्या आप सुनिश्चित हैं?",
    text: "एक बार सबमिट करने के बाद डेटा लॉक हो जाएगा और इसे दोबारा संपादित नहीं किया जा सकेगा।",
    showCancelButton: true,
    confirmButtonText: "हाँ, सबमिट करें",
    cancelButtonText: "रद्द करें",
    confirmButtonColor: "#dc2626",
  });
  return result.isConfirmed;
}
