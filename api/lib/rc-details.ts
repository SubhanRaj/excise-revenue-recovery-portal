// Per-RC breakdown behind rcCount/rcAmount (order 3.i/3.ii) — mirrored byte-for-byte in
// frontend/lib/pac-fields.ts (see CLAUDE.md's Data model section, "duplicated by design" —
// no shared package between the two apps). Independent of recoveredAmount/stayAmount/
// openingBalance/netRecoverable: an RC is issued to inform a defaulter what they owe, for any
// amount, regardless of what's actually recovered (see CLAUDE.md's Validation rules). `stayed`
// (a court staying this specific RC) is a separate concept from the aggregate Stay Count/Stay
// Amount fields (a court staying recovery of an amount) — no cross-check between the two.
export type RcDetail = {
  rcNumber: string;
  rcAmount: number;
  stayed: boolean;
};

export const RC_NUMBER_MAX_LENGTH = 50;

// Zero-trust validator, called from both the submit route's validateRow() and mirrored
// client-side (YearStepForm.tsx) before Save & Continue. Returns a plain English message (this
// app's existing convention for server-side rejection strings — see validateRow() in the
// submit route) or null if valid.
export function validateRcDetails(rcCount: number, rcAmount: number, rcDetails: RcDetail[]): string | null {
  if (rcDetails.length !== rcCount) {
    return `RC Details must have exactly ${rcCount} entries (received ${rcDetails.length})`;
  }
  let sum = 0;
  for (let i = 0; i < rcDetails.length; i++) {
    const d = rcDetails[i];
    const rcNumber = typeof d.rcNumber === "string" ? d.rcNumber.trim() : "";
    if (!rcNumber) return `RC #${i + 1}: RC Number cannot be blank`;
    if (rcNumber.length > RC_NUMBER_MAX_LENGTH) {
      return `RC #${i + 1}: RC Number cannot exceed ${RC_NUMBER_MAX_LENGTH} characters`;
    }
    if (typeof d.rcAmount !== "number" || Number.isNaN(d.rcAmount) || d.rcAmount < 0) {
      return `RC #${i + 1}: RC Amount must be a non-negative number`;
    }
    if (typeof d.stayed !== "boolean") {
      return `RC #${i + 1}: stayed must be true or false`;
    }
    sum += d.rcAmount;
  }
  // Small epsilon, not strict equality — these are floating-point rupee amounts.
  if (Math.abs(sum - rcAmount) > 0.01) {
    return `RC Details total (${sum}) must equal RC Amount (${rcAmount})`;
  }
  return null;
}
