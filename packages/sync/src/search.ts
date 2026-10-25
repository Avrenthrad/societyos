import type { Entity, EntityType } from "@societyos/core";
import type { Store } from "./store.js";

/** Text fields worth searching for each entity type. */
const fields: Partial<Record<EntityType, (e: any) => (string | undefined)[]>> = {
  person: (e) => [e.name, ...e.emails, e.notes],
  note: (e) => [e.title, e.body, ...e.tags],
  task: (e) => [e.title],
  event: (e) => [e.title, e.location],
  message: (e) => [e.subject, e.body],
  place: (e) => [e.name, e.address],
  transaction: (e) => [e.description, e.category],
  file: (e) => [e.name],
};

/**
 * Search across every app's data at once. Simple substring match for now;
 * replace with SQLite full-text search when the SQLite store lands.
 */
export async function searchAll(store: Store, query: string): Promise<Entity[]> {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const results: Entity[] = [];
  for (const [type, get] of Object.entries(fields) as [EntityType, (e: any) => (string | undefined)[]][]) {
    const hits = await store.list(type, (e) =>
      get(e).some((v) => v?.toLowerCase().includes(q)),
    );
    results.push(...hits);
  }
  return results;
}
