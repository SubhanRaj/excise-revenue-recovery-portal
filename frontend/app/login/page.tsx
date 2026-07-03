"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/api";
import { sha256Hex } from "@/lib/crypto";
import { saveClientSession } from "@/lib/session";
import { alertError, alertSuccess } from "@/lib/alerts";
import Button from "@/components/ui/Button";
import TextField from "@/components/ui/TextField";

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
    <div className="flex flex-1 items-center justify-center bg-gradient-to-b from-slate-50 to-indigo-50 px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-600 text-2xl font-bold text-white shadow-lg shadow-indigo-200">
            ₹
          </div>
          <h1 className="text-lg font-semibold text-slate-900">Department of Excise, Uttar Pradesh</h1>
          <p className="mt-1 text-sm text-slate-500">Excise Revenue Recovery Portal</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/60">
          <div className="mb-6 flex rounded-lg bg-slate-100 p-1 text-sm">
            <button
              className={`flex-1 rounded-md py-2 font-medium transition-colors ${
                tab === "cug" ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
              onClick={() => setTab("cug")}
              type="button"
            >
              CUG Mobile (DEO)
            </button>
            <button
              className={`flex-1 rounded-md py-2 font-medium transition-colors ${
                tab === "email" ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
              onClick={() => setTab("email")}
              type="button"
            >
              Email (Admin)
            </button>
          </div>

          {tab === "cug" ? (
            <form onSubmit={submitCug} className="space-y-4">
              <TextField
                label="CUG Mobile Number"
                icon="ti-device-mobile"
                type="tel"
                inputMode="numeric"
                maxLength={10}
                placeholder="10-digit CUG mobile number"
                value={mobile}
                onChange={(e) => setMobile(e.target.value.replace(/\D/g, ""))}
              />
              <Button type="submit" disabled={busy} className="w-full">
                {busy ? "Signing in..." : "Login"}
              </Button>
            </form>
          ) : (
            <form onSubmit={submitEmail} className="space-y-4">
              <TextField
                label="Email Address"
                icon="ti-mail"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <Button type="submit" disabled={busy} className="w-full">
                {busy ? "Sending..." : "Send Login Link"}
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
