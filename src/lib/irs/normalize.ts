/** Normalizes organization names so grant recipients can be matched to peer orgs. */

const SUFFIXES = /\b(INC|INCORPORATED|CORP|CORPORATION|CO|LLC|LTD|THE|OF|AND|NFP|NONPROFIT)\b/g;

export function normalizeOrgName(name: string): string {
  return name
    .toUpperCase()
    .replace(/&/g, " AND ")
    .replace(/[^A-Z0-9 ]+/g, " ")
    .replace(SUFFIXES, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeEin(ein: string | number): string {
  return String(ein).replace(/\D/g, "").padStart(9, "0");
}
