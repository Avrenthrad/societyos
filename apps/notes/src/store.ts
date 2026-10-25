import { PersistedStore, type KeyValue } from "@societyos/sync";
import { newNote } from "@societyos/notes-logic";

/** Browser / desktop storage, or in-memory where there is none (phones, for now). */
function deviceStorage(): KeyValue {
  try {
    const ls = (globalThis as { localStorage?: Storage }).localStorage;
    if (ls) {
      ls.setItem("societyos:probe", "1");
      return ls;
    }
  } catch {
    // private mode or blocked storage
  }
  const mem = new Map<string, string>();
  return { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => void mem.set(k, v) };
}

// Saved on this device and shared with the other SocietyOS apps on it, so
// Today's events and People's contacts show up here. Swap for the SQLite +
// sync store once the backend is set up (see docs/architecture.md).
export const store = new PersistedStore(deviceStorage());
export const ME = "local-user";
export const APP = "notes";
export const ctx = { ownerId: ME, sourceApp: APP };

const WELCOME = `Notes are saved on this device as you type and work offline.

## Try it
- [ ] Tick me
- [ ] Tap → Today on me to make me a task
- Tag notes like #ideas or #work/projects to file them
- Link notes with [[Another note]] and people with @Their Name

Meetings in Today get a note of their own a few minutes before they start.`;

/** Load saved data; on the very first run add a how-to note. */
export const ready: Promise<void> = (async () => {
  await store.load();
  // Pick up changes saved by the other SocietyOS apps open in other tabs.
  (store as { watchStorage?: () => void }).watchStorage?.();
  if ((await store.list("note")).length > 0) return;
  await store.put(newNote(ctx, { title: "Welcome to Notes", body: WELCOME, pinned: true }));
})();
