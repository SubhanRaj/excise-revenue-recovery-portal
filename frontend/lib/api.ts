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
