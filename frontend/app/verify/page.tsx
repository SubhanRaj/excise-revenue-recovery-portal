"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/api";
import { saveClientSession } from "@/lib/session";
import { alertError } from "@/lib/alerts";

function VerifyForm() {
  const router = useRouter();
  const token = useSearchParams().get("token");
  const [busy, setBusy] = useState(false);

  async function verify() {
    if (!token) return alertError("Invalid link.");
    setBusy(true);
    try {
      const res = await apiFetch<{ role: "deo" | "admin"; districtId: number | null }>(
        "/api/auth/verify-magic-link",
        { method: "POST", body: JSON.stringify({ token }) }
      );
      saveClientSession(res);
      router.push(res.role === "admin" ? "/admin" : "/entry");
    } catch (err) {
      await alertError(err instanceof ApiError ? err.message : "Verification failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 px-4">
      <div className="w-full max-w-sm rounded-lg border border-zinc-200 bg-white p-6 text-center shadow-sm">
        <h1 className="mb-4 text-lg font-semibold text-zinc-900">Verify Login</h1>
        <button
          onClick={verify}
          disabled={busy || !token}
          className="w-full rounded-md bg-zinc-900 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Verify &amp; Continue
        </button>
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
