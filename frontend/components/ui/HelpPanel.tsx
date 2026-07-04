"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

type Props = {
  pageKey: string;
  title: string;
  children: React.ReactNode;
};

// A fixed round help button pinned just below the header (stays in place while the page
// scrolls) — never opens on its own, only when the DEO clicks it. Two separate dismiss
// actions: the X just closes the balloon for now (the button stays, reopenable any time);
// "Don't show this again" additionally persists a per-page localStorage flag that clears the
// unread dot — it never hides or disables the button itself, so help stays reachable.
export default function HelpPanel({ pageKey, title, children }: Props) {
  const storageKey = `help_done_${pageKey}`;
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const [openUpward, setOpenUpward] = useState(false);
  const [panelWidth, setPanelWidth] = useState(384);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      setDone(localStorage.getItem(storageKey) === "true");
    } catch {}
  }, [storageKey]);

  // Runs before paint: pick whichever side (above/below the button) actually has room for a
  // roughly 300px-tall balloon, and cap its width to the viewport so it's never clipped.
  useLayoutEffect(() => {
    if (!open || !wrapperRef.current) return;
    const rect = wrapperRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    setOpenUpward(spaceBelow < 300 && rect.top > spaceBelow);
    setPanelWidth(Math.min(384, window.innerWidth - 32));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  function dismissForever() {
    try {
      localStorage.setItem(storageKey, "true");
    } catch {}
    setDone(true);
    setOpen(false);
  }

  return (
    <div ref={wrapperRef} className="group fixed right-6 top-24 z-40">
      {!open && (
        <span className="pointer-events-none absolute right-full top-1/2 mr-3 -translate-y-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100">
          Help / Instructions
        </span>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={open ? "Close help" : "Open help and instructions"}
        className="relative flex h-12 w-12 items-center justify-center rounded-full bg-indigo-600 text-white shadow-lg shadow-indigo-600/30 transition-colors hover:bg-indigo-700"
      >
        <i className="ti ti-help-circle text-2xl" />
        {!done && <span className="absolute right-0 top-0 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white" />}
      </button>

      {open && (
        <div
          role="region"
          aria-label={`Help: ${title}`}
          style={{ width: panelWidth }}
          className={`absolute right-0 space-y-3 rounded-lg border border-indigo-100 bg-white p-4 shadow-2xl ${
            openUpward ? "bottom-full mb-3" : "top-full mt-3"
          }`}
        >
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-sm font-semibold text-indigo-700">{title}</h3>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close help panel"
              className="shrink-0 rounded-md p-0.5 text-slate-400 hover:text-slate-600"
            >
              <i className="ti ti-x text-base" />
            </button>
          </div>

          <div className="max-h-64 space-y-2 overflow-y-auto pr-1 text-sm text-slate-700">{children}</div>

          {!done && (
            <button
              type="button"
              onClick={dismissForever}
              className="rounded-md bg-indigo-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-indigo-700"
            >
              Don&apos;t show this again
            </button>
          )}
        </div>
      )}
    </div>
  );
}
