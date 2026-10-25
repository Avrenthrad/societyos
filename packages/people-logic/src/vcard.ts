import { createEntity, type Person } from "@societyos/core";
import type { Store } from "@societyos/sync";
import { parseBirthday } from "./birthdays.js";
import { findPerson, type Base } from "./people.js";

/**
 * Contacts from a phone or Google / Outlook export (.vcf). Parsed on the
 * device: contact details never leave it.
 */
export interface ContactCard {
  name: string;
  emails: string[];
  phones: string[];
  birthday?: string;
  notes?: string;
}

function unescape(v: string) {
  return v.replace(/\\n/gi, "\n").replace(/\\([,;\\])/g, "$1");
}

function decodeQuotedPrintable(v: string) {
  const bytes: number[] = [];
  for (let i = 0; i < v.length; i++) {
    if (v[i] === "=" && /^[0-9A-F]{2}$/i.test(v.slice(i + 1, i + 3))) {
      bytes.push(parseInt(v.slice(i + 1, i + 3), 16));
      i += 2;
    } else bytes.push(v.charCodeAt(i));
  }
  try {
    return new TextDecoder().decode(new Uint8Array(bytes));
  } catch {
    return v;
  }
}

/** Read every card in a .vcf file (vCard 2.1, 3.0 and 4.0). */
export function parseVCards(text: string): ContactCard[] {
  // Unfold: a line starting with a space or tab continues the one before.
  // vCard 2.1 quoted-printable lines continue after a trailing "=".
  const lines = text.replace(/\r\n?/g, "\n").replace(/=\n/g, "").replace(/\n[ \t]/g, "").split("\n");
  const out: ContactCard[] = [];
  let cur: (ContactCard & { n?: string }) | undefined;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (/^BEGIN:VCARD$/i.test(line)) {
      cur = { name: "", emails: [], phones: [] };
      continue;
    }
    if (/^END:VCARD$/i.test(line)) {
      if (cur) {
        const name = cur.name || cur.n || cur.emails[0] || cur.phones[0];
        if (name) out.push({ name, emails: cur.emails, phones: cur.phones, birthday: cur.birthday, notes: cur.notes });
      }
      cur = undefined;
      continue;
    }
    if (!cur) continue;
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const head = line.slice(0, colon);
    let value = line.slice(colon + 1);
    const [propRaw, ...params] = head.split(";");
    const prop = propRaw!.replace(/^item\d+\./i, "").toUpperCase();
    if (params.some((p) => /ENCODING=QUOTED-PRINTABLE/i.test(p))) value = decodeQuotedPrintable(value);
    value = unescape(value).trim();
    if (!value) continue;
    switch (prop) {
      case "FN":
        cur.name = value;
        break;
      case "N": {
        const [family = "", given = "", middle = "", prefix = "", suffix = ""] = value.split(";");
        cur.n = [prefix, given, middle, family, suffix].map((s) => s.trim()).filter(Boolean).join(" ");
        break;
      }
      case "EMAIL":
        if (!cur.emails.includes(value)) cur.emails.push(value);
        break;
      case "TEL": {
        const tel = value.replace(/^tel:/i, "");
        if (!cur.phones.includes(tel)) cur.phones.push(tel);
        break;
      }
      case "BDAY":
        cur.birthday = parseBirthday(value.replace(/T.*$/, "")) ?? cur.birthday;
        break;
      case "NOTE":
        cur.notes = value;
        break;
    }
  }
  return out;
}

export interface ImportResult {
  added: number;
  updated: number;
  unchanged: number;
}

const union = (a: string[], b: string[]) => [...a, ...b.filter((x) => !a.some((y) => y.toLowerCase() === x.toLowerCase()))];

/**
 * Add contacts, merging into people who already exist (same email, phone
 * or name) rather than duplicating them. Never overwrites what's there:
 * only fills gaps and adds new emails and numbers.
 */
export async function importContacts(store: Store, cards: ContactCard[], base: Base): Promise<ImportResult> {
  const people = await store.list("person");
  const res: ImportResult = { added: 0, updated: 0, unchanged: 0 };
  for (const c of cards) {
    const hit =
      c.emails.map((email) => findPerson(people, { email })).find(Boolean) ??
      c.phones.map((phone) => findPerson(people, { phone })).find(Boolean) ??
      findPerson(people, { name: c.name });
    if (!hit) {
      const p = createEntity("person", {
        ...base, name: c.name, emails: c.emails, phones: c.phones,
        ...(c.birthday ? { birthday: c.birthday } : {}), ...(c.notes ? { notes: c.notes } : {}),
      });
      await store.put(p);
      people.push(p);
      res.added++;
      continue;
    }
    const merged: Person = {
      ...hit,
      emails: union(hit.emails, c.emails),
      phones: union(hit.phones, c.phones),
      birthday: hit.birthday ?? c.birthday,
      notes: hit.notes ?? c.notes,
    };
    const changed =
      merged.emails.length !== hit.emails.length || merged.phones.length !== hit.phones.length ||
      merged.birthday !== hit.birthday || merged.notes !== hit.notes;
    if (changed) {
      await store.put(merged);
      people[people.indexOf(hit)] = merged;
      res.updated++;
    } else res.unchanged++;
  }
  return res;
}
