import { API_BASE_URL } from "./config";
import type { Role } from "./session";

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

// Session auth is now an HttpOnly cookie (see api/lib/session.ts) — same-origin fetch()
// attaches it automatically, no Authorization header or `credentials: "include"` needed. The
// `role` parameter is kept (unused here) only to avoid touching every call site's signature;
// it has no effect on the request itself anymore.
export async function apiFetch<T>(path: string, init?: RequestInit, _role?: Role): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(body.error ?? "Unknown error occurred.", res.status);
  }
  return body as T;
}

// For multipart/FormData bodies (e.g. POST /api/deo/request-unlock) — apiFetch() above always
// sets Content-Type: application/json, which would break the multipart boundary the browser
// needs to set itself for FormData. Same auth/error-shape handling as apiFetch, just without
// that header.
export async function apiFetchForm<T>(path: string, body: FormData, _role: Role): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, { method: "POST", body });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(json.error ?? "Unknown error occurred.", res.status);
  }
  return json as T;
}

// For binary responses (the unlock-request PDF attachment) — apiFetch() above always calls
// res.json(), which would fail on a PDF body. The HttpOnly cookie is attached automatically by
// the browser same as any other same-origin request; callers fetch the blob and hand it to
// URL.createObjectURL since a plain <iframe src="..."> can't set headers itself anyway.
export async function apiFetchBlob(path: string, _role: Role): Promise<Blob> {
  const res = await fetch(`${API_BASE_URL}${path}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(body.error ?? "Unknown error occurred.", res.status);
  }
  return res.blob();
}
