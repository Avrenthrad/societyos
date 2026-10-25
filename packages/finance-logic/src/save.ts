import { createEntity, type CalendarEvent, type FileRef, type ID, type Person, type Place, type Transaction } from "@societyos/core";
import { link, linksFor, type Store } from "@societyos/sync";
import { createBill } from "./bills.js";
import { merchantKey, suggestCategory } from "./categorize.js";
import type { ImportRow } from "./csv.js";
import type { MoneyEntry } from "./entry.js";
import { DEFAULT_CURRENCY } from "./money.js";

/**
 * Saving money things and joining them to the rest of SocietyOS.
 * Links used (so People, Today and search all see them):
 *   transaction -related->    person   (shows on that person's timeline)
 *   transaction -located-at-> place
 *   transaction -related->    event
 *   transaction -attached->   file     (receipt)
 */

type Owner = { ownerId: ID; sourceApp: string };

async function findOrCreatePlace(store: Store, name: string, owner: Owner): Promise<Place> {
  const lower = name.toLowerCase();
  const found = (await store.list("place", (p) => p.name.toLowerCase() === lower))[0];
  if (found) return found;
  const place = createEntity("place", { ...owner, name });
  await store.put(place);
  return place;
}

async function findOrCreatePerson(store: Store, name: string, owner: Owner): Promise<Person> {
  const lower = name.toLowerCase();
  const found = (await store.list("person", (p) => p.name.toLowerCase() === lower))[0];
  if (found) return found;
  const person = createEntity("person", { ...owner, name, emails: [], phones: [] });
  await store.put(person);
  return person;
}

/** Save a quick entry. A repeating one becomes a bill (and a task in Today). */
export async function saveEntry(store: Store, e: MoneyEntry, owner: Owner, currency = DEFAULT_CURRENCY) {
  if (e.amountMinor === undefined) throw new Error("No amount");
  if (e.recurrence) {
    return { kind: "bill" as const, ...(await createBill(store, {
      name: e.description || e.place?.name || "Bill",
      amountMinor: e.amountMinor,
      currency,
      dueAt: e.date,
      recurrence: e.recurrence,
      category: e.category,
    }, owner)) };
  }
  const history = await store.list("transaction");
  const tx = createEntity("transaction", {
    ...owner,
    amountMinor: e.amountMinor,
    currency,
    occurredAt: e.date.toISOString(),
    description: e.description || "Spend",
    category: e.category ?? suggestCategory(`${e.description} ${e.place?.name ?? ""}`, history, e.amountMinor),
  });
  await store.put(tx);
  for (const id of e.personIds) {
    const p = await store.get("person", id);
    if (p) await link(store, tx, p, "related", owner);
  }
  for (const name of e.newPeople) await link(store, tx, await findOrCreatePerson(store, name, owner), "related", owner);
  if (e.place) {
    const place = (e.place.id && (await store.get("place", e.place.id))) || (await findOrCreatePlace(store, e.place.name, owner));
    await link(store, tx, place, "located-at", owner);
  }
  return { kind: "transaction" as const, transaction: tx };
}

/** Save the chosen rows of a CSV import. Categories are guessed from history. */
export async function saveImport(store: Store, rows: ImportRow[], owner: Owner & { account?: string; currency?: string }) {
  const history = await store.list("transaction");
  const known = new Set(history.map((t) => t.importKey).filter(Boolean));
  const saved: Transaction[] = [];
  for (const r of rows) {
    if (r.duplicate || known.has(r.importKey)) continue;
    const tx = createEntity("transaction", {
      ownerId: owner.ownerId,
      sourceApp: owner.sourceApp,
      amountMinor: r.amountMinor,
      currency: owner.currency ?? DEFAULT_CURRENCY,
      occurredAt: r.occurredAt.toISOString(),
      description: r.description,
      category: suggestCategory(r.description, [...history, ...saved], r.amountMinor),
      account: owner.account,
      importKey: r.importKey,
    });
    await store.put(tx);
    saved.push(tx);
    known.add(r.importKey);
  }
  return saved;
}

/** Everything a transaction is joined to, by kind. */
export interface TxLinks {
  people: Person[];
  places: Place[];
  events: CalendarEvent[];
  receipts: FileRef[];
  linkIds: Map<ID, ID>;
}

export async function transactionLinks(store: Store, tx: Transaction): Promise<TxLinks> {
  const out: TxLinks = { people: [], places: [], events: [], receipts: [], linkIds: new Map() };
  for (const l of await linksFor(store, tx.id)) {
    const other = l.fromId === tx.id ? l.toId : l.fromId;
    const person = await store.get("person", other);
    if (person) out.people.push(person);
    const place = person ? undefined : await store.get("place", other);
    if (place) out.places.push(place);
    const event = person || place ? undefined : await store.get("event", other);
    if (event) out.events.push(event);
    const file = person || place || event ? undefined : await store.get("file", other);
    if (file) out.receipts.push(file);
    out.linkIds.set(other, l.id);
  }
  return out;
}

export async function unlink(store: Store, links: TxLinks, otherId: ID) {
  const id = links.linkIds.get(otherId);
  if (id) await store.remove("link", id);
}

/** Change a category and teach it: other uncategorised spends at the same merchant follow. */
export async function setCategory(store: Store, tx: Transaction, category: string | undefined) {
  await store.put({ ...tx, category });
  if (!category) return 0;
  const key = merchantKey(tx.description);
  if (!key) return 0;
  const same = await store.list("transaction", (t) => t.id !== tx.id && !t.category && merchantKey(t.description) === key);
  for (const t of same) await store.put({ ...t, category });
  return same.length;
}

export { findOrCreatePerson, findOrCreatePlace };
