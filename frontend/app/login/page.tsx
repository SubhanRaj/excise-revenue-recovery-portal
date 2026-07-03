"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/api";
import { sha256Hex } from "@/lib/crypto";
import { saveClientSession } from "@/lib/session";
import { alertError, alertSuccess } from "@/lib/alerts";

type Tab = "cug" | "email";

export default function LoginPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("cug");
  const [mobile, setMobile] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  async function submitCug(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\d{10}$/.test(mobile)) {
      return alertError("Please enter a valid 10-digit mobile number.");
    }
    setBusy(true);
    try {
      const cugHash = await sha256Hex(mobile);
      const res = await apiFetch<{ role: "deo" | "admin"; districtId: number | null }>(
        "/api/auth/verify-cug",
        { method: "POST", body: JSON.stringify({ cugHash }) }
      );
      saveClientSession(res);
      router.push(res.role === "admin" ? "/admin" : "/entry");
    } catch (err) {
      await alertError(err instanceof ApiError ? err.message : "Login failed.");
    } finally {
      setBusy(false);
    }
  }

  async function submitEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return alertError("Please enter a valid email address.");
    }
    setBusy(true);
    try {
      await apiFetch("/api/auth/request-magic-link", { method: "POST", body: JSON.stringify({ email }) });
      await alertSuccess("If this email is registered, a login link has been sent.");
    } catch (err) {
      await alertError(err instanceof ApiError ? err.message : "Request failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 px-4">
      <div className="w-full max-w-sm rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
        <h1 className="text-lg font-semibold text-zinc-900">Department of Excise, Uttar Pradesh</h1>
        <p className="mb-6 text-sm text-zinc-500">Excise Revenue Recovery Portal</p>

        <div className="mb-4 flex rounded-md bg-zinc-100 p-1 text-sm">
          <button
            className={`flex-1 rounded py-1.5 ${tab === "cug" ? "bg-white shadow-sm font-medium" : "text-zinc-500"}`}
            onClick={() => setTab("cug")}
            type="button"
          >
            CUG Mobile (DEO)
          </button>
          <button
            className={`flex-1 rounded py-1.5 ${tab === "email" ? "bg-white shadow-sm font-medium" : "text-zinc-500"}`}
            onClick={() => setTab("email")}
            type="button"
          >
            Email (Admin)
          </button>
        </div>

        {tab === "cug" ? (
          <form onSubmit={submitCug} className="space-y-3">
            <input
              type="tel"
              inputMode="numeric"
              maxLength={10}
              placeholder="10-digit CUG mobile number"
              value={mobile}
              onChange={(e) => setMobile(e.target.value.replace(/\D/g, ""))}
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500"
            />
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-md bg-zinc-900 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              Login
            </button>
          </form>
        ) : (
          <form onSubmit={submitEmail} className="space-y-3">
            <input
              type="email"
              placeholder="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500"
            />
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-md bg-zinc-900 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              Send Login Link
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
