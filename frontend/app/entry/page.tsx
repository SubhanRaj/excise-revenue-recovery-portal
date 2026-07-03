"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { db, type DraftYear } from "@/lib/db";
import { FINANCIAL_YEARS, PAC_FIELD_ORDER } from "@/lib/pac-fields";
import { apiFetch, ApiError } from "@/lib/api";
import { readClientSession, clearClientSession } from "@/lib/session";
import { alertBlankField, alertError, alertSuccess, confirmFinalSubmit } from "@/lib/alerts";
import YearStepForm from "@/components/YearStepForm";
import MasterView from "@/components/MasterView";

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
    if (blank) return alertBlankField();

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
    const confirmed = await confirmFinalSubmit();
    if (!confirmed) return;

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
      await alertSuccess("डेटा सफलतापूर्वक सबमिट और लॉक कर दिया गया है।");
      router.replace("/login");
    } catch (err) {
      await alertError(err instanceof ApiError ? err.message : "सबमिट विफल रहा।");
    } finally {
      setSubmitting(false);
    }
  }

  if (!ready) return null;

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <nav className="mb-6 flex flex-wrap gap-2">
        {FINANCIAL_YEARS.map((fy, i) => (
          <button
            key={fy}
            type="button"
            onClick={() => goToStep(i)}
            disabled={i !== 0 && !years[i - 1]?.completed}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              step === i ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-600"
            } disabled:cursor-not-allowed disabled:opacity-40`}
          >
            वर्ष {i + 1}
          </button>
        ))}
        <button
          type="button"
          onClick={() => goToStep(5)}
          disabled={!years.every((y) => y.completed)}
          className={`rounded-md px-3 py-1.5 text-sm font-medium ${
            step === 5 ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-600"
          } disabled:cursor-not-allowed disabled:opacity-40`}
        >
          मास्टर व्यू
        </button>
      </nav>

      {step < 5 ? (
        <YearStepForm
          year={years[step]}
          onFieldChange={(field, value) => updateField(step, field, value)}
          onSaveAndContinue={() => saveAndContinue(step)}
          isLastYear={step === 4}
        />
      ) : (
        <MasterView
          years={years}
          submittedByName={submittedByName}
          onSubmittedByNameChange={setSubmittedByName}
          onSubmit={submitAll}
          busy={submitting}
        />
      )}
    </div>
  );
}
