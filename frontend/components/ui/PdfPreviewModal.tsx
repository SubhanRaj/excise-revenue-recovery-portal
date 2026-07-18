"use client";

import { useEffect, useState } from "react";
import { apiFetchBlob, ApiError } from "@/lib/api";
import Button from "./Button";

// First modal in this app that isn't SweetAlert2 — an <iframe> preview doesn't fit Swal's
// HTML-string API (same reasoning as the DEO-side unlock-request form). Renders the PDF
// through the browser's own native viewer via a blob: object URL, since the attachment route
// needs a Bearer token (no cookies in this app — see CLAUDE.md's Auth section) that a plain
// <iframe src="..."> can't attach itself.
export default function PdfPreviewModal({
  requestId,
  filename,
  onClose,
}: {
  requestId: number;
  filename: string | null;
  onClose: () => void;
}) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let revoke: string | null = null;
    apiFetchBlob(`/api/admin/unlock-requests/attachment?id=${requestId}`, "admin")
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        revoke = url;
        setBlobUrl(url);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load attachment."));
    return () => {
      if (revoke) URL.revokeObjectURL(revoke);
    };
  }, [requestId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="flex h-[85vh] w-full max-w-4xl flex-col rounded-xl bg-white shadow-2xl dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-200">{filename ?? "Attachment"}</p>
          <div className="flex items-center gap-2">
            {blobUrl && (
              <a href={blobUrl} download={filename ?? "attachment.pdf"}>
                <Button variant="secondary" size="xs">
                  <i className="ti ti-download text-sm" />
                  Download
                </Button>
              </a>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
            >
              <i className="ti ti-x text-base" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-hidden rounded-b-xl">
          {error ? (
            <div className="flex h-full items-center justify-center text-sm text-red-600 dark:text-red-400">{error}</div>
          ) : blobUrl ? (
            <iframe src={blobUrl} title={filename ?? "PDF preview"} className="h-full w-full border-0" />
          ) : (
            <div className="flex h-full items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
