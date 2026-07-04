// Mirrors frontend/lib/crypto.ts's sha256Hex exactly (Web Crypto is available in both the
// browser and the Workers runtime). Used only for admin bulk-provisioning, where the admin
// supplies a DEO's raw CUG number via an uploaded spreadsheet and the server must hash it —
// unlike the DEO's own login flow, where the browser hashes before ever sending it here.
export async function sha256Hex(input: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(bytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
