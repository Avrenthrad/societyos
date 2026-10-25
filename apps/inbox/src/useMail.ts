import type { Person } from "@societyos/core";
import type { MailMessage, Op } from "@societyos/mail-logic";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { pushOps } from "./accounts";
import { mailbox, store } from "./store";

export function useMailState() {
  return useSyncExternalStore(mailbox.subscribe, () => mailbox.state);
}

/** Re-render whenever anything in the shared store changes, from any app. */
export function useStoreVersion() {
  const [v, setV] = useState(0);
  useEffect(() => {
    const off = store.subscribe(() => setV((x) => x + 1));
    return () => {
      off();
    };
  }, []);
  return v;
}

export function usePeople(ready: boolean) {
  const v = useStoreVersion();
  const [people, setPeople] = useState<Person[]>([]);
  useEffect(() => {
    let live = true;
    store.list("person").then((p) => live && setPeople(p));
    return () => {
      live = false;
    };
  }, [v, ready]);
  const knownEmails = useMemo(() => new Set(people.flatMap((p) => p.emails.map((e) => e.toLowerCase()))), [people]);
  return { people, knownEmails };
}

/** Current time, ticking each minute; also wakes snoozed mail. */
export function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => {
      const n = new Date();
      mailbox.wake(n);
      setNow(n);
    }, 60_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

// ---- Toasts --------------------------------------------------------------

export interface Toast {
  id: number;
  text: string;
  action?: { label: string; run: () => void };
}

let toast: Toast | undefined;
const toastListeners = new Set<() => void>();
let toastTimer: ReturnType<typeof setTimeout> | undefined;
let toastSeq = 0;

export function showToast(text: string, action?: Toast["action"], ms = 6000) {
  toast = { id: ++toastSeq, text, action };
  for (const l of toastListeners) l();
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, ms);
}

export function hideToast() {
  toast = undefined;
  for (const l of toastListeners) l();
}

export function useToast() {
  return useSyncExternalStore(
    (l) => {
      toastListeners.add(l);
      return () => {
        toastListeners.delete(l);
      };
    },
    () => toast,
  );
}

// ---- Changes ---------------------------------------------------------------

const snapshot = (ops: Op[]): MailMessage[] => {
  const ids = new Set(ops.flatMap((o) => o.ids));
  return mailbox.state.messages.filter((m) => ids.has(m.id));
};

/** Change mail here and at Outlook / Gmail. With a message, shows it with Undo. */
export function act(ops: Op[], message?: string) {
  const live = ops.filter((o) => o.ids.length);
  if (!live.length) return;
  const before = snapshot(live);
  const undo = mailbox.apply(live);
  void pushOps(live, before);
  if (message) {
    showToast(message, undo.length ? {
      label: "Undo",
      run: () => {
        const was = snapshot(undo);
        mailbox.apply(undo);
        void pushOps(undo, was);
        hideToast();
      },
    } : undefined);
  }
}
