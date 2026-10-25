import type { Entity, EntityOf, EntityType, ID } from "@societyos/core";

export type Change = { op: "put" | "delete"; entity: Entity };
export type Listener = (change: Change) => void;

/**
 * The one data API every app uses. Apps never talk to the server directly:
 * they read and write the local store, and the store syncs in the background.
 * That keeps every app fast and usable offline, and means a change made in
 * one app shows up in the others straight away.
 */
export interface Store {
  get<T extends EntityType>(type: T, id: ID): Promise<EntityOf<T> | undefined>;
  list<T extends EntityType>(
    type: T,
    filter?: (e: EntityOf<T>) => boolean,
  ): Promise<EntityOf<T>[]>;
  put(entity: Entity): Promise<void>;
  /** Soft delete: sets deletedAt so the delete syncs. */
  remove(type: EntityType, id: ID): Promise<void>;
  /** Hear about every change, from this app, other apps, or other devices. */
  subscribe(listener: Listener): () => void;
  /** Apply a change that came from the server. Last write wins. */
  applyRemote(entity: Entity): Promise<boolean>;
}

/** True if `incoming` should replace `current` (last write wins). */
export function isNewer(incoming: Entity, current: Entity | undefined): boolean {
  if (!current) return true;
  if (incoming.updatedAt !== current.updatedAt) {
    return incoming.updatedAt > current.updatedAt;
  }
  // Same timestamp: break the tie by id so every device agrees.
  return incoming.id > current.id;
}
