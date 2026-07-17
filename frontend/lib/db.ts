import Dexie, { type EntityTable } from "dexie";
import type { FinancialYear } from "./pac-fields";

// One row of the RC Details section — raw string amount, same Anti-Blank-Rule reasoning as
// every other money field in DraftYear below.
export type DraftRcDetail = {
  rcNumber: string;
  rcAmount: string;
  stayed: boolean;
};

// DEO local staging row. Numeric fields are kept as raw strings so an empty string
// ("never typed") stays distinguishable from an explicit "0" — the Anti-Blank Rule needs that.
export type DraftYear = {
  financialYear: FinancialYear;
  grossArrears: string;
  rcCount: string;
  rcAmount: string;
  // Added after this table's first release — a pre-existing IndexedDB row from before this
  // field existed simply won't have it, so every read site falls back to `?? []` rather than
  // assuming it's always present (same pattern as a missing FY elsewhere in this app).
  rcDetails: DraftRcDetail[];
  recoveredAmount: string;
  stayCount: string;
  stayAmount: string;
  completed: boolean;
};

export type CachedDistrict = {
  id: number;
  districtName: string;
  lockStatus: number;
  unlockedAt: string | null;
  unlockReason: string | null;
  unlockedBy: string | null;
  deoEmail?: string | null;
};

export type CachedPacData = {
  id: number;
  districtId: number;
  financialYear: string;
  grossArrears: number;
  rcCount: number;
  rcAmount: number;
  // Raw JSON string straight off the pac_data column — parsed on demand where displayed
  // (district detail page's disclosure, Excel export), same as audit_log.metadata elsewhere.
  rcDetails: string;
  recoveredAmount: number;
  stayCount: number;
  stayAmount: number;
  openingBalance: number;
  netRecoverable: number;
  submittedByName: string | null;
  lockedAt: string | null;
};

const db = new Dexie("excise-revenue-recovery-portal") as Dexie & {
  draftYears: EntityTable<DraftYear, "financialYear">;
  adminDistricts: EntityTable<CachedDistrict, "id">;
  adminPacData: EntityTable<CachedPacData, "id">;
};

db.version(1).stores({
  draftYears: "financialYear",
  adminDistricts: "id",
  adminPacData: "id, districtId",
});

export { db };
