"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/api";
import { saveClientSession, markJustAuthed } from "@/lib/session";
import Button from "@/components/ui/Button";
import Banner from "@/components/ui/Banner";

function VerifyForm() {
  const router = useRouter();
  const token = useSearchParams().get("token");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function verify() {
    if (!token) return setError("Invalid link.");
    setError(null);
    setBusy(true);
    try {
      const res = await apiFetch<{ role: "deo" | "admin"; districtId: number | null }>(
        "/api/auth/verify-magic-link",
        { method: "POST", body: JSON.stringify({ token }) }
      );
      saveClientSession(res);
      markJustAuthed();
      router.push(res.role === "admin" ? "/admin" : "/entry");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Verification failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center bg-gradient-to-b from-slate-50 to-indigo-50 px-4">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-8 text-center shadow-xl shadow-slate-200/60">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-indigo-100 text-indigo-600">
          <i className="ti ti-shield-check text-2xl" />
        </div>
        <h1 className="mb-1 text-lg font-semibold text-slate-900">Verify Login</h1>
        <p className="mb-6 text-sm text-slate-500">Confirm below to complete signing in.</p>
        {error && (
          <div className="mb-4 text-left">
            <Banner variant="error">{error}</Banner>
          </div>
        )}
        <Button onClick={verify} disabled={busy || !token} className="w-full">
          {busy ? "Verifying..." : "Verify & Continue"}
        </Button>
      </div>
    </div>
  );
}

export default function VerifyPage() {
  return (
    <Suspense>
      <VerifyForm />
    </Suspense>
  );
}
