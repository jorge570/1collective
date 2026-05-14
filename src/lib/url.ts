// [CC-FOUNDATION] Public base URL helper.
// Picks an explicit NEXT_PUBLIC_APP_URL first, then falls back to the
// Replit dev domain, then localhost. Used by anything that needs to
// emit a public URL the customer will see (signature links, pay links,
// receipt downloads, etc).

export function publicBaseUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (explicit) return explicit;
  const replit = process.env.REPLIT_DEV_DOMAIN;
  if (replit) return `https://${replit}`;
  return "http://localhost:5000";
}
