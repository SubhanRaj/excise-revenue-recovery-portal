import { API_BASE_URL } from "./config";
import { getToken, type Role } from "./session";

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

// `role` attaches that role's stored Bearer token (see session.ts) as the Authorization
// header — omit it for pre-login calls (verify-cug, verify-magic-link, request-magic-link)
// that have no token yet. Not a cookie, so no `credentials: "include"` needed and no browser
// cross-site-cookie policy can block it.
export async function apiFetch<T>(path: string, init?: RequestInit, role?: Role): Promise<T> {
  const token = role ? getToken(role) : null;
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
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
export async function apiFetchForm<T>(path: string, body: FormData, role: Role): Promise<T> {
  const token = getToken(role);
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(json.error ?? "Unknown error occurred.", res.status);
  }
  return json as T;
}

// For binary responses (the unlock-request PDF attachment) — apiFetch() above always calls
// res.json(), which would fail on a PDF body. Needs the Bearer header itself since this app
// has no cookies (see CLAUDE.md's Auth section), so a plain <iframe src="..."> or <a href="...">
// can't hit the route directly; callers fetch the blob and hand it to URL.createObjectURL.
export async function apiFetchBlob(path: string, role: Role): Promise<Blob> {
  const token = getToken(role);
  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(body.error ?? "Unknown error occurred.", res.status);
  }
  return res.blob();
}
