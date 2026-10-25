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
  private merging = false;

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

  /**
   * Pick up rows another app or tab saved since we last looked. Every
   * SocietyOS web app shares one storage key, so Finance can add a task
   * that Today shows. Newer rows win, and listeners hear about them.
   */
  async refresh(): Promise<number> {
    const raw = await this.kv.getItem(this.storageKey);
    if (!raw) return 0;
    let rows: Entity[];
    try {
      rows = JSON.parse(raw) as Entity[];
    } catch {
      return 0;
    }
    let changed = 0;
    this.merging = true;
    try {
      for (const e of rows) if (await this.applyRemote(e)) changed++;
    } finally {
      this.merging = false;
    }
    return changed;
  }

  /**
   * Write now instead of waiting for the debounce. Merges what is already
   * saved first, so two apps open at once never wipe each other's rows.
   */
  async flush() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    await this.refresh();
    await this.kv.setItem(this.storageKey, JSON.stringify(this.snapshot()));
  }

  /**
   * Browsers only: apply changes other tabs and apps save (the "storage"
   * event fires in every other tab of the same site). Call once at start.
   */
  watchStorage(): () => void {
    const g = globalThis as { addEventListener?: (t: string, f: (e: { key: string | null }) => void) => void; removeEventListener?: (t: string, f: (e: { key: string | null }) => void) => void };
    if (!g.addEventListener) return () => {};
    const onStorage = (e: { key: string | null }) => {
      if (e.key === this.storageKey || e.key === null) void this.refresh();
    };
    g.addEventListener("storage", onStorage);
    return () => g.removeEventListener?.("storage", onStorage);
  }

  private scheduleSave() {
    if (this.merging) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), this.delayMs);
  }
}
