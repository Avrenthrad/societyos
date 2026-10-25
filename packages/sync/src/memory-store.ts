import type { Entity, EntityOf, EntityType, ID } from "@societyos/core";
import { isNewer, type Listener, type Store } from "./store.js";

/**
 * In-memory Store for tests and early prototyping. The real app swaps this
 * for a SQLite-backed store with the same interface.
 */
export class MemoryStore implements Store {
  private rows = new Map<string, Entity>();
  private listeners = new Set<Listener>();

  private key(type: EntityType, id: ID) {
    return `${type}:${id}`;
  }

  async get<T extends EntityType>(type: T, id: ID) {
    const e = this.rows.get(this.key(type, id));
    return e && !e.deletedAt ? (e as EntityOf<T>) : undefined;
  }

  async list<T extends EntityType>(type: T, filter?: (e: EntityOf<T>) => boolean) {
    const out: EntityOf<T>[] = [];
    for (const e of this.rows.values()) {
      if (e.type !== type || e.deletedAt) continue;
      const typed = e as EntityOf<T>;
      if (!filter || filter(typed)) out.push(typed);
    }
    return out;
  }

  async put(entity: Entity) {
    const stamped = { ...entity, updatedAt: new Date().toISOString() } as Entity;
    this.rows.set(this.key(entity.type, entity.id), stamped);
    this.emit({ op: "put", entity: stamped });
  }

  async remove(type: EntityType, id: ID) {
    const e = this.rows.get(this.key(type, id));
    if (!e) return;
    const now = new Date().toISOString();
    const deleted = { ...e, deletedAt: now, updatedAt: now } as Entity;
    this.rows.set(this.key(type, id), deleted);
    this.emit({ op: "delete", entity: deleted });
  }

  async applyRemote(entity: Entity) {
    const k = this.key(entity.type, entity.id);
    if (!isNewer(entity, this.rows.get(k))) return false;
    this.rows.set(k, entity);
    this.emit({ op: entity.deletedAt ? "delete" : "put", entity });
    return true;
  }

  subscribe(listener: Listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(change: Parameters<Listener>[0]) {
    for (const l of this.listeners) l(change);
  }
}
