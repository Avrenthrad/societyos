import type { Entity } from "@societyos/core";
import { isNewer } from "./store.js";
import { MemoryStore } from "./memory-store.js";

/** Anything that can hold a string by key: localStorage, AsyncStorage, a file. */
export interface KeyValue {
  getItem(key: string): string | null | Promise<string | null>;
  setItem(key: string, value: string): void | Promise<void>;
}

/**
 * A MemoryStore that saves itself to device storage, so data survives a
 * reload and works offline. A stopgap until the SQLite store lands: it
 * rewrites the whole snapshot on each change, which is fine for one
 * person's tasks and events but not for years of email.
 */
export class PersistedStore extends MemoryStore {
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private kv: KeyValue,
    private storageKey = "societyos:store:v1",
    private delayMs = 150,
  ) {
    super();
    this.subscribe(() => this.scheduleSave());
  }

  /** Read saved rows. Returns how many there were (0 on first run). */
  async load(): Promise<number> {
    const raw = await this.kv.getItem(this.storageKey);
    if (!raw) return 0;
    let rows: Entity[];
    try {
      rows = JSON.parse(raw) as Entity[];
    } catch {
      return 0; // unreadable save: start empty rather than crash
    }
    for (const e of rows) {
      const k = `${e.type}:${e.id}`;
      if (isNewer(e, this.rows.get(k))) this.rows.set(k, e);
    }
    return rows.length;
  }

  /** Write now instead of waiting for the debounce. */
  async flush() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    await this.kv.setItem(this.storageKey, JSON.stringify(this.snapshot()));
  }

  private scheduleSave() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), this.delayMs);
  }
}
