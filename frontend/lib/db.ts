import Dexie, { type EntityTable } from "dexie";
import type { FinancialYear } from "./pac-fields";

// DEO local staging row. Numeric fields are kept as raw strings so an empty string
// ("never typed") stays distinguishable from an explicit "0" — the Anti-Blank Rule needs that.
export type DraftYear = {
  financialYear: FinancialYear;
  grossArrears: string;
  rcCount: string;
  rcAmount: string;
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
  recoveredAmount: number;
  stayCount: number;
  stayAmount: number;
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
