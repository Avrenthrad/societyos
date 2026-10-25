import type { Address } from "./types.js";

/** "Sam Lee <sam@example.com>, bob@example.com" -> addresses. Skips anything without an @. */
export function parseAddressList(input: string): Address[] {
  const out: Address[] = [];
  // Split on commas or semicolons that are not inside quotes or <...>.
  const parts: string[] = [];
  let cur = "";
  let quote = false;
  let angle = false;
  for (const ch of input) {
    if (ch === '"') quote = !quote;
    else if (ch === "<") angle = true;
    else if (ch === ">") angle = false;
    if ((ch === "," || ch === ";") && !quote && !angle) {
      parts.push(cur);
      cur = "";
    } else cur += ch;
  }
  parts.push(cur);
  for (const raw of parts) {
    const p = raw.trim();
    if (!p) continue;
    const m = /^(.*)<([^>]+)>$/.exec(p);
    const email = (m ? m[2]! : p).trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+$/.test(email)) continue;
    const name = m ? m[1]!.trim().replace(/^"|"$/g, "").trim() : "";
    out.push(name ? { name, email } : { email });
  }
  return out;
}

export function formatAddress(a: Address): string {
  if (!a.name) return a.email;
  const name = /[",;<>]/.test(a.name) ? `"${a.name.replace(/"/g, "")}"` : a.name;
  return `${name} <${a.email}>`;
}

/** Name if there is one, else the part before the @. */
export function displayName(a: Address): string {
  return a.name || a.email.split("@")[0]!;
}

export function sameAddress(a: Address, b: Address) {
  return a.email.toLowerCase() === b.email.toLowerCase();
}

/** "Re: Re: Fwd: Dinner" -> "Dinner". */
export function baseSubject(subject: string): string {
  return subject.replace(/^\s*((re|fw|fwd|aw|sv)\s*(\[\d+\])?\s*:\s*)+/i, "").trim();
}
