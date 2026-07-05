"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { db, type DraftYear } from "@/lib/db";
import { FINANCIAL_YEARS, PAC_FIELD_ORDER } from "@/lib/pac-fields";
import { apiFetch, ApiError } from "@/lib/api";
import { clearClientSession, consumeJustAuthed } from "@/lib/session";
import { formatIST } from "@/lib/format";
import {
  confirmFinalSubmit,
  promptDeoNameAndLock,
  confirmClearYear,
  confirmClearAll,
  notifyToast,
} from "@/lib/alerts";
import YearStepForm from "@/components/YearStepForm";
import MasterView from "@/components/MasterView";
import Button from "@/components/ui/Button";
import AppHeader from "@/components/ui/AppHeader";
import HelpPanel from "@/components/ui/HelpPanel";
import type { Profile } from "@/components/ui/ProfileMenu";
import { SITE_TITLE_EN, SITE_TITLE_HI, DATA_PERIOD_EN } from "@/lib/site";

const BLANK_FIELD_TITLE = "Field left blank / फ़ील्ड खाली है";
const BLANK_FIELD_TEXT =
  "Please do not leave any field blank. Enter 0 if there is no due amount or recovery. / " +
  "कृपया कोई भी फ़ील्ड खाली न छोड़ें। यदि कोई धनराशि या वसूली नहीं है तो 0 दर्ज करें।";

// Shape of a row returned by GET /api/pac-data/mine — the raw pac_data table row (numbers),
// as opposed to DraftYear's raw-string fields (see db.ts for why those stay strings).
type RemoteYearRow = {
  financialYear: string;
  grossArrears: number;
  rcCount: number;
  rcAmount: number;
  recoveredAmount: number;
  stayCount: number;
  stayAmount: number;
};

function blankYear(financialYear: (typeof FINANCIAL_YEARS)[number]): DraftYear {
  return {
    financialYear,
    grossArrears: "",
    rcCount: "",
    rcAmount: "",
    recoveredAmount: "",
    stayCount: "",
    stayAmount: "",
    completed: false,
  };
}

export default function EntryPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [years, setYears] = useState<DraftYear[]>(FINANCIAL_YEARS.map(blankYear));
  const [step, setStep] = useState(0); // 0..4 = year steps, 5 = master view
  // Bumped on every clear so YearStepForm remounts (key includes this) — it otherwise keeps its
  // own internal followRc/parityTouched state across a clear that only resets Dexie/parent state.
  const [clearVersion, setClearVersion] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  // True once we know (from the server, not a cached hint) that this DEO's district is
  // currently locked — a returning DEO who logs back in after locking (nothing prevents that
  // login itself) previously saw a blank form, because the local Dexie draft is wiped on
  // submit and there was nothing checking D1 for the real, current lock state.
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    (async () => {
      // Ask the server directly rather than pre-checking a local hint — see the matching
      // comment in lib/useAdminData.ts. This session lives in its own cookie (independent of
      // any admin session in the same browser), so this always reflects this page's own login.
      let p: Profile;
      try {
        p = await apiFetch<Profile>("/api/auth/me?role=deo");
        setProfile(p);
        if (consumeJustAuthed()) {
          notifyToast({ icon: "success", title: `Welcome, DEO ${p.districtName ?? ""}`.trim() });
        }
      } catch {
        clearClientSession();
        router.replace("/login");
        return;
      }

      if (p.lockStatus === 1) {
        setLocked(true);
        setReady(true);
        return;
      }

      // Unlocked — either a fresh DEO who's never submitted, or one an Admin just unlocked.
      // In the unlock case D1 still holds the real, previously-submitted figures (an unlock
      // never clears pac_data — see CLAUDE.md) even though the local Dexie draft was wiped at
      // submit time, so fetch it and let it win over any (stale/blank) local draft per year.
      const remoteByYear = new Map<string, DraftYear>();
      try {
        const { years: remoteRows } = await apiFetch<{ years: RemoteYearRow[] }>("/api/pac-data/mine");
        for (const row of remoteRows) {
          remoteByYear.set(row.financialYear, {
            financialYear: row.financialYear as (typeof FINANCIAL_YEARS)[number],
            grossArrears: String(row.grossArrears),
            rcCount: String(row.rcCount),
            rcAmount: String(row.rcAmount),
            recoveredAmount: String(row.recoveredAmount),
            stayCount: String(row.stayCount),
            stayAmount: String(row.stayAmount),
            completed: true,
          });
        }
      } catch {
        // Best-effort — fall back to whatever's already in the local Dexie cache below.
      }

      const stored = await db.draftYears.toArray();
      const merged = FINANCIAL_YEARS.map(
        (fy) => remoteByYear.get(fy) ?? stored.find((y) => y.financialYear === fy) ?? blankYear(fy)
      );
      // Keep Dexie in sync with whatever D1 just gave us, so Clear/Clear All and every other
      // local-only operation on this page keep working against real state on the next reload.
      await db.draftYears.bulkPut(merged);
      setYears(merged);
      const firstIncomplete = merged.findIndex((y) => !y.completed);
      setStep(firstIncomplete === -1 ? 5 : firstIncomplete);
      setReady(true);
    })();
  }, [router]);

  function updateField(index: number, field: keyof DraftYear, value: string) {
    setYears((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      db.draftYears.put(next[index]);
      return next;
    });
  }

  async function saveAndContinue(index: number) {
    const year = years[index];
    const blank = PAC_FIELD_ORDER.some((field) => year[field].trim() === "");
    if (blank) return notifyToast({ icon: "error", title: BLANK_FIELD_TITLE, text: BLANK_FIELD_TEXT });

    const updated = { ...year, completed: true };
    setYears((prev) => {
      const next = [...prev];
      next[index] = updated;
      return next;
    });
    await db.draftYears.put(updated);
    setStep(index + 1 <= 4 ? index + 1 : 5);
  }

  // Both only reachable pre-lock (these buttons/the whole page disappear once submitAll()
  // locks and redirects away) — clears the local Dexie draft only, never touches D1.
  // No confirm() popup here, unlike AppHeader's logout (which does ask first) — once a DEO is on
  // this locked screen, logging out is the *only* thing left to do, so a blocking "are you sure"
  // would just be an extra click in front of a choice with no other option.
  async function logoutLocked() {
    await apiFetch(`/api/auth/logout?role=deo`, { method: "POST" }).catch(() => {});
    clearClientSession();
    notifyToast({ icon: "info", title: "Logged out" });
    router.replace("/login");
  }

  async function clearYear(index: number) {
    const confirmed = await confirmClearYear(`FY ${years[index].financialYear}`);
    if (!confirmed) return;
    const blanked = blankYear(years[index].financialYear);
    await db.draftYears.put(blanked);
    setYears((prev) => {
      const next = [...prev];
      next[index] = blanked;
      return next;
    });
    setClearVersion((v) => v + 1);
    if (step > index) setStep(index);
  }

  async function clearAllData() {
    const confirmed = await confirmClearAll();
    if (!confirmed) return;
    await db.draftYears.clear();
    setYears(FINANCIAL_YEARS.map(blankYear));
    setClearVersion((v) => v + 1);
    setStep(0);
  }

  function goToStep(target: number) {
    if (target === 0 || years[target - 1]?.completed) setStep(target);
  }

  async function submitAll() {
    // Two-step confirm, both blocking modals since locking is irreversible without an Admin
    // unlock: first a plain "have you checked the data" confirm, then a name-entry prompt
    // with its own liability disclaimer — modeled on the sibling excise-bakaya-record
    // project's single Swal.fire({ input: "text" }) "Verify & Lock Record" prompt.
    const confirmed = await confirmFinalSubmit();
    if (!confirmed) return;
    const submittedByName = await promptDeoNameAndLock();
    if (!submittedByName) return;

    setSubmitError(null);
    setSubmitting(true);
    try {
      await apiFetch("/api/pac-data/submit", {
        method: "POST",
        body: JSON.stringify({
          submittedByName,
          years: years.map((y) => ({
            financialYear: y.financialYear,
            grossArrears: Number(y.grossArrears),
            rcCount: Number(y.rcCount),
            rcAmount: Number(y.rcAmount),
            recoveredAmount: Number(y.recoveredAmount),
            stayCount: Number(y.stayCount),
            stayAmount: Number(y.stayAmount),
          })),
        }),
      });
      await db.draftYears.clear();
      clearClientSession();
      setSubmitted(true);
      setTimeout(() => router.replace("/login"), 1800);
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : "Submit failed.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!ready) {
    return (
      <div className="flex min-h-full flex-1 flex-col bg-slate-50 dark:bg-slate-950">
        <AppHeader title="DEO Data Entry" role="deo" profile={profile} />
        <div className="mx-auto w-full max-w-4xl flex-1 px-4 pt-8 pb-24 sm:pb-8">
          <div className="mb-4 h-24 w-full animate-pulse rounded-lg bg-blue-50/50 dark:bg-blue-950/20" />
          <div className="mb-6 h-12 w-full animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800" />
          <div className="h-[400px] w-full animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800" />
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="flex flex-1 items-center justify-center bg-gradient-to-b from-slate-50 to-blue-50 px-4 dark:from-slate-950 dark:to-slate-900">
        <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-8 text-center shadow-xl shadow-slate-200/60 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-900 dark:text-emerald-300">
            <i className="ti ti-circle-check text-2xl" />
          </div>
          <h1 className="mb-1 text-lg font-semibold text-slate-900 dark:text-slate-100">Submitted &amp; Locked</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Redirecting to login...</p>
        </div>
      </div>
    );
  }

  if (locked) {
    return (
      <div className="flex min-h-full flex-1 flex-col bg-slate-50 dark:bg-slate-950">
        <AppHeader title="DEO Data Entry" role="deo" profile={profile} />
        <div className="flex flex-1 items-center justify-center px-4 py-12">
          <div className="w-full max-w-2xl rounded-xl border border-slate-200 bg-white p-8 text-center shadow-xl shadow-slate-200/60 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-300">
              <i className="ti ti-lock text-2xl" />
            </div>
            <h1 className="mb-2 text-lg font-semibold text-slate-900 dark:text-slate-100">Data Already Locked</h1>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              You locked your submission on{" "}
              <span className="font-medium text-slate-900 dark:text-slate-100">
                {formatIST(profile?.lockedAt)} IST
              </span>
              .
            </p>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              You cannot make any further changes. If any data was entered incorrectly or needs
              editing, contact the Admin / Excise Headquarters to have this district unlocked.
            </p>
            <p className="mt-3 text-sm text-slate-600 dark:text-slate-400" lang="hi">
              आपने अपना डेटा {formatIST(profile?.lockedAt)} IST को लॉक कर दिया है। अब कोई और
              बदलाव संभव नहीं है। किसी भी गलत डेटा या संशोधन के लिए एडमिन / आबकारी मुख्यालय से
              संपर्क करें।
            </p>
            <Button variant="dark" size="md" className="mt-6 w-full" onClick={logoutLocked}>
              <i className="ti ti-logout text-sm" />
              Logout
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-1 flex-col bg-slate-50 dark:bg-slate-950">
      <AppHeader title="DEO Data Entry" role="deo" profile={profile} />
      <HelpPanel pageKey="deo-entry" title="Filling this form">
        <p>
          Enter all six PAC/RC fields for each year. None may be left blank — type 0 if there
          is genuinely no amount, so a blank never gets silently treated as zero.
        </p>
        <p>
          <strong>Recovered Amount</strong> must exactly match <strong>RC Amount</strong> — it
          auto-fills from RC Amount until you edit it directly, and &quot;Save &amp;
          Continue&quot; stays disabled until the two match.
        </p>
        <p>
          <strong>Net Recoverable</strong> updates live as you type; it is calculated for
          display only and is not stored separately.
        </p>
        <p>
          Each financial year unlocks only once the previous one is saved.
          &quot;Final Submit &amp; Lock&quot; on the Master View is irreversible without an
          Admin unlock.
        </p>
      </HelpPanel>
      <div className={`mx-auto w-full flex-1 px-4 pt-8 pb-24 sm:pb-8 ${step === 5 ? "max-w-6xl" : "max-w-4xl"}`}>
        {/* Tells the DEO what they're filing before they see any form fields — sits below the
            header/help button and above the year pills, not inside the sticky nav itself, so it
            scrolls away once they're deep into a year's fields instead of permanently eating
            sticky-bar height. */}
        <div className="mb-4 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-center dark:border-blue-900 dark:bg-blue-950/40">
          <p className="text-sm font-semibold text-blue-900 dark:text-blue-200">{SITE_TITLE_EN}</p>
          <p className="text-xs text-blue-700 dark:text-blue-300" lang="hi">
            {SITE_TITLE_HI}
          </p>
          <p className="mt-1 text-xs text-blue-600 dark:text-blue-400">{DATA_PERIOD_EN}</p>
        </div>
        <nav className="sticky top-16 z-10 mb-6 flex flex-col items-stretch gap-2 border-b border-slate-100 bg-slate-50/95 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95 sm:flex-row sm:items-center">
          <div className="flex items-center gap-1 sm:flex-wrap sm:gap-2">
            {FINANCIAL_YEARS.map((fy, i) => {
              const done = years[i]?.completed;
              const locked = i !== 0 && !years[i - 1]?.completed;
              return (
                <button
                  key={fy}
                  type="button"
                  onClick={() => goToStep(i)}
                  disabled={locked}
                  style={locked ? { cursor: "not-allowed" } : undefined}
                  className={`flex flex-1 items-center justify-center gap-1 rounded-full px-2 py-1 text-xs font-medium transition-colors sm:flex-none sm:justify-start sm:gap-1.5 sm:px-3.5 sm:py-1.5 sm:text-sm ${
                    step === i
                      ? "bg-blue-600 text-white shadow-sm"
                      : done
                        ? "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                        : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                  } disabled:opacity-40`}
                >
                  FY {fy}
                </button>
              );
            })}
          </div>
          {/* flex-1 on both so they split the row edge-to-edge on mobile (rather than sitting
              compact/left-aligned with dead space on the right) — sm:flex-none once there's a
              sticky nav row wide enough that hugging their own content (Master View pinned via
              sm:ml-auto) looks right instead. */}
          <div className="flex items-center gap-2 sm:ml-auto">
            <Button
              type="button"
              variant="dangerSoft"
              size="xs"
              onClick={clearAllData}
              className="flex-1 sm:flex-none"
            >
              <i className="ti ti-trash text-sm" />
              Clear All
            </Button>
            <button
              type="button"
              onClick={() => goToStep(5)}
              disabled={!years.every((y) => y.completed)}
              style={!years.every((y) => y.completed) ? { cursor: "not-allowed" } : undefined}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors sm:flex-none sm:justify-start ${
                step === 5
                  ? "bg-blue-600 text-white shadow-sm"
                  : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
              } disabled:opacity-40`}
            >
              <i className="ti ti-clipboard-list text-base" />
              Master View
            </button>
          </div>
        </nav>

        <div key={step} className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 animate-in fade-in slide-in-from-right-2 duration-300">
          {step < 5 ? (
            <YearStepForm
              key={`${years[step].financialYear}-${clearVersion}`}
              year={years[step]}
              onFieldChange={(field, value) => updateField(step, field, value)}
              onSaveAndContinue={() => saveAndContinue(step)}
              onBack={step > 0 ? () => setStep(step - 1) : undefined}
              onClear={() => clearYear(step)}
              isLastYear={step === 4}
            />
          ) : (
            <MasterView
              years={years}
              districtName={profile?.districtName}
              onSubmit={submitAll}
              busy={submitting}
              error={submitError}
            />
          )}
        </div>
      </div>
    </div>
  );
}
