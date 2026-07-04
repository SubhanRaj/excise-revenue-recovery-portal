"use client";

// Ported from the sibling up-excise-spatial-revenue-optimizer project's HelpPanel — same
// behavior (dismiss-once badge, edge-aware flip, click-outside/Escape to close), restyled
// off DaisyUI's `btn`/`card`/`base-*` classes onto this repo's plain-Tailwind indigo/slate
// palette since this app has no DaisyUI (or shadcn, despite appearances) installed.
import { useEffect, useLayoutEffect, useRef, useState } from "react";

type Props = {
  pageKey: string;
  title: string;
  children: React.ReactNode;
};

export default function HelpPanel({ pageKey, title, children }: Props) {
  const storageKey = `help_done_${pageKey}`;
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const [alignRight, setAlignRight] = useState(false);
  const [alignTop, setAlignTop] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const balloonRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      setDone(localStorage.getItem(storageKey) === "true");
    } catch {}
  }, [storageKey]);

  useLayoutEffect(() => {
    if (!open || !balloonRef.current) return;
    const rect = balloonRef.current.getBoundingClientRect();
    setAlignRight(rect.right > window.innerWidth - 8);
    setAlignTop(rect.bottom > window.innerHeight - 8);
  }, [open]);

  useEffect(() => {
    if (!open) {
      setAlignRight(false);
      setAlignTop(false);
    }
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

  function markDone() {
    try {
      localStorage.setItem(storageKey, "true");
    } catch {}
    setDone(true);
    setOpen(false);
  }

  return (
    <div ref={wrapperRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={open ? "Close help" : "Open help and instructions"}
        className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium ${
          done ? "text-slate-400 hover:text-slate-600" : "text-indigo-600 hover:text-indigo-700"
        }`}
      >
        <i className="ti ti-help-circle text-base" />
        {done ? "Help" : "Help / Instructions"}
        {done && <i className="ti ti-circle-check text-emerald-500" />}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-[1001] bg-black/10 backdrop-blur-[2px]" aria-hidden="true" />
          <div
            ref={balloonRef}
            role="region"
            aria-label={`Help: ${title}`}
            className={`absolute z-[1002] w-[min(28rem,90vw)] space-y-3 rounded-lg border border-indigo-100 bg-white p-4 shadow-2xl ${
              alignRight ? "right-0" : "left-0"
            } ${alignTop ? "bottom-full mb-1" : "top-full mt-1"}`}
          >
            <div
              className={`absolute h-3 w-3 rotate-45 border-indigo-100 bg-white ${
                alignRight ? "right-3" : "left-3"
              } ${alignTop ? "-bottom-1.5 border-b border-r" : "-top-1.5 border-l border-t"}`}
            />

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
                onClick={markDone}
                className="rounded-md bg-indigo-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-indigo-700"
              >
                Got it — don&apos;t show hint badge again
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
