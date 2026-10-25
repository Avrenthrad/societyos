import {
  applyOps,
  demoMailbox,
  demoPeople,
  emptyState,
  inverseOps,
  wakeSnoozed,
  type MailState,
  type Op,
} from "@societyos/mail-logic";
import { createEntity } from "@societyos/core";
import { PersistedStore, type KeyValue } from "@societyos/sync";

/** Browser / desktop storage, or in-memory where there is none (phones, for now). */
export function deviceStorage(): KeyValue {
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

const kv = deviceStorage();

// The shared SocietyOS store: tasks, notes and people every app sees. Inbox
// writes here only when an email is turned into something.
export const store = new PersistedStore(kv);
// Pick up changes other open apps make (added by the shared deploy work).
(store as { watchStorage?: () => void }).watchStorage?.();
export const ME = "local-user";
export const APP = "inbox";
export const base = { ownerId: ME, sourceApp: APP };

const MAIL_KEY = "societyos:inbox:v1";

/**
 * The mailbox itself, saved on this device under its own key so years of
 * email never weigh down the shared store. Changes go through `apply` so they
 * can be undone and written back to Outlook or Gmail.
 */
class Mailbox {
  state: MailState = emptyState();
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setTimeout> | undefined;

  async load() {
    const raw = await kv.getItem(MAIL_KEY);
    if (raw) {
      try {
        this.state = JSON.parse(raw) as MailState;
      } catch {
        this.state = emptyState();
      }
    }
    if (!this.state.accounts.length) {
      this.state = demoMailbox();
      // Give People a few of the sample senders, so matching has something to show.
      const people = await store.list("person");
      for (const a of demoPeople) {
        if (!people.some((p) => p.emails.includes(a.email))) {
          await store.put(createEntity("person", { ...base, name: a.name!, emails: [a.email], phones: [] }));
        }
      }
    }
    this.wake();
    this.emit();
  }

  set(next: MailState) {
    if (next === this.state) return;
    this.state = next;
    this.emit();
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void kv.setItem(MAIL_KEY, JSON.stringify(this.state)), 200);
  }

  /** Apply changes; returns the ops that undo them. */
  apply(ops: Op[]): Op[] {
    const undo = inverseOps(this.state, ops);
    this.set(applyOps(this.state, ops));
    return undo;
  }

  /** Bring back snoozed mail whose time has come. */
  wake(now = new Date()) {
    const next = wakeSnoozed(this.state, now);
    if (next) this.set(next);
  }

  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  };

  private emit() {
    for (const l of this.listeners) l();
  }
}

export const mailbox = new Mailbox();
export const ready: Promise<void> = store.load().then(() => mailbox.load());
