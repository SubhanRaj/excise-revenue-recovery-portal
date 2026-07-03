"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { db, type DraftYear } from "@/lib/db";
import { FINANCIAL_YEARS, PAC_FIELD_ORDER } from "@/lib/pac-fields";
import { apiFetch, ApiError } from "@/lib/api";
import { readClientSession, clearClientSession } from "@/lib/session";
import { confirmFinalSubmit } from "@/lib/alerts";
import YearStepForm from "@/components/YearStepForm";
import MasterView from "@/components/MasterView";
import AppHeader from "@/components/ui/AppHeader";
import Banner from "@/components/ui/Banner";

const BLANK_FIELD_MESSAGE =
  "Please do not leave any field blank. Enter 0 if there is no due amount or recovery.";

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
  const [submittedByName, setSubmittedByName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [blankError, setBlankError] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    (async () => {
      const session = readClientSession();
      if (!session || session.role !== "deo") {
        router.replace("/login");
        return;
      }
      try {
        await apiFetch("/api/auth/me");
      } catch {
        clearClientSession();
        router.replace("/login");
        return;
      }

      const stored = await db.draftYears.toArray();
      const merged = FINANCIAL_YEARS.map(
        (fy) => stored.find((y) => y.financialYear === fy) ?? blankYear(fy)
      );
      setYears(merged);
      const firstIncomplete = merged.findIndex((y) => !y.completed);
      setStep(firstIncomplete === -1 ? 5 : firstIncomplete);
      setReady(true);
    })();
  }, [router]);

  function updateField(index: number, field: keyof DraftYear, value: string) {
    setBlankError(false);
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
    if (blank) return setBlankError(true);
    setBlankError(false);

    const updated = { ...year, completed: true };
    setYears((prev) => {
      const next = [...prev];
      next[index] = updated;
      return next;
    });
    await db.draftYears.put(updated);
    setStep(index + 1 <= 4 ? index + 1 : 5);
  }

  function goToStep(target: number) {
    if (target === 0 || years[target - 1]?.completed) setStep(target);
  }

  async function submitAll() {
    if (submittedByName.trim().length === 0) return;
    // The one remaining confirm dialog: locking a district's submission is irreversible
    // without an Admin unlock, so this warrants a blocking confirmation, unlike routine messages.
    const confirmed = await confirmFinalSubmit();
    if (!confirmed) return;

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

  if (!ready) return null;

  if (submitted) {
    return (
      <div className="flex flex-1 items-center justify-center bg-gradient-to-b from-slate-50 to-indigo-50 px-4">
        <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-8 text-center shadow-xl shadow-slate-200/60">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
            <i className="ti ti-circle-check text-2xl" />
          </div>
          <h1 className="mb-1 text-lg font-semibold text-slate-900">Submitted &amp; Locked</h1>
          <p className="text-sm text-slate-500">Redirecting to login...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-1 flex-col bg-slate-50">
      <AppHeader title="DEO Data Entry" />
      <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        <nav className="mb-6 flex flex-wrap items-center gap-2">
          {FINANCIAL_YEARS.map((fy, i) => {
            const done = years[i]?.completed;
            const locked = i !== 0 && !years[i - 1]?.completed;
            return (
              <button
                key={fy}
                type="button"
                onClick={() => goToStep(i)}
                disabled={locked}
                className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                  step === i
                    ? "bg-indigo-600 text-white shadow-sm"
                    : done
                      ? "bg-indigo-50 text-indigo-700"
                      : "bg-slate-100 text-slate-500"
                } disabled:cursor-not-allowed disabled:opacity-40`}
              >
                {done && step !== i && <i className="ti ti-check text-base" />}
                Year {i + 1}
              </button>
            );
          })}
          <span className="mx-1 h-px flex-1 bg-slate-200" />
          <button
            type="button"
            onClick={() => goToStep(5)}
            disabled={!years.every((y) => y.completed)}
            className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
              step === 5 ? "bg-indigo-600 text-white shadow-sm" : "bg-slate-100 text-slate-500"
            } disabled:cursor-not-allowed disabled:opacity-40`}
          >
            <i className="ti ti-clipboard-list text-base" />
            Master View
          </button>
        </nav>

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          {step < 5 ? (
            <YearStepForm
              year={years[step]}
              onFieldChange={(field, value) => updateField(step, field, value)}
              onSaveAndContinue={() => saveAndContinue(step)}
              isLastYear={step === 4}
              blankErrorMessage={blankError ? BLANK_FIELD_MESSAGE : null}
            />
          ) : (
            <MasterView
              years={years}
              submittedByName={submittedByName}
              onSubmittedByNameChange={setSubmittedByName}
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
