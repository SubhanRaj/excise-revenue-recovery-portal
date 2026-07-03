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
      return alertError("कृपया 10 अंकों का मोबाइल नंबर दर्ज करें।");
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
      await alertError(err instanceof ApiError ? err.message : "लॉगिन विफल रहा।");
    } finally {
      setBusy(false);
    }
  }

  async function submitEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return alertError("कृपया मान्य ईमेल पता दर्ज करें।");
    }
    setBusy(true);
    try {
      await apiFetch("/api/auth/request-magic-link", { method: "POST", body: JSON.stringify({ email }) });
      await alertSuccess("यदि यह ईमेल पंजीकृत है, तो आपको लॉगिन लिंक भेज दिया गया है।");
    } catch (err) {
      await alertError(err instanceof ApiError ? err.message : "अनुरोध विफल रहा।");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 px-4">
      <div className="w-full max-w-sm rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
        <h1 className="text-lg font-semibold text-zinc-900">आबकारी विभाग, उत्तर प्रदेश</h1>
        <p className="mb-6 text-sm text-zinc-500">Excise Revenue Recovery Portal</p>

        <div className="mb-4 flex rounded-md bg-zinc-100 p-1 text-sm">
          <button
            className={`flex-1 rounded py-1.5 ${tab === "cug" ? "bg-white shadow-sm font-medium" : "text-zinc-500"}`}
            onClick={() => setTab("cug")}
            type="button"
          >
            CUG मोबाइल (DEO)
          </button>
          <button
            className={`flex-1 rounded py-1.5 ${tab === "email" ? "bg-white shadow-sm font-medium" : "text-zinc-500"}`}
            onClick={() => setTab("email")}
            type="button"
          >
            ईमेल (Admin)
          </button>
        </div>

        {tab === "cug" ? (
          <form onSubmit={submitCug} className="space-y-3">
            <input
              type="tel"
              inputMode="numeric"
              maxLength={10}
              placeholder="10-अंकों का CUG मोबाइल नंबर"
              value={mobile}
              onChange={(e) => setMobile(e.target.value.replace(/\D/g, ""))}
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500"
            />
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-md bg-zinc-900 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              प्रवेश करें
            </button>
          </form>
        ) : (
          <form onSubmit={submitEmail} className="space-y-3">
            <input
              type="email"
              placeholder="ईमेल पता"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500"
            />
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-md bg-zinc-900 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              लॉगिन लिंक भेजें
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
