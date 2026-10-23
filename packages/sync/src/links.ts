import { createEntity, type Entity, type ID, type LinkRelation } from "@societyos/core";
import type { Store } from "./store.js";

/** Join two entities from any apps, e.g. a task created from a message. */
export async function link(
  store: Store,
  from: Entity,
  to: Entity,
  relation: LinkRelation,
  opts: { ownerId: ID; sourceApp: string },
) {
  const l = createEntity("link", { ...opts, fromId: from.id, toId: to.id, relation });
  await store.put(l);
  return l;
}

/** Every link touching an entity, in either direction. */
export function linksFor(store: Store, id: ID) {
  return store.list("link", (l) => l.fromId === id || l.toId === id);
}
