import {
  discardDraft,
  folderCounts,
  listThreads,
  recordSent,
  replyDraft,
  saveDraft,
  threadOps,
  type Draft,
  type MailMessage,
  type Tab,
  type View as MailView,
} from "@societyos/mail-logic";
import { font, radius, space } from "@societyos/ui";
import { useEffect, useMemo, useRef, useState } from "react";
import { Modal, Platform, Pressable, Text, View, useWindowDimensions } from "react-native";
import { handleRedirect, sendDraft, syncAll } from "../src/accounts";
import { Compose } from "../src/components/Compose";
import { Settings } from "../src/components/Settings";
import { Sidebar } from "../src/components/Sidebar";
import { ThreadList, viewTitle } from "../src/components/ThreadList";
import { ThreadView } from "../src/components/ThreadView";
import { Button } from "../src/components/ui";
import { mailbox, ready } from "../src/store";
import { useTheme, type Theme } from "../src/theme";
import { act, hideToast, showToast, useMailState, useNow, usePeople, useToast } from "../src/useMail";

/**
 * Three layouts by window width, like Today:
 * - desktop (1200+): folders, list, reading pane, SocietyOS panel
 * - tablet (700+, iPad): list + reading pane; folders in a drawer
 * - phone: list, then the conversation full screen
 */
const DESKTOP = 1200;
const TABLET = 700;
const UNDO_SEND_MS = 5000;

export default function InboxScreen() {
  const t = useTheme();
  const { c } = t;
  const { width } = useWindowDimensions();
  const desktop = width >= DESKTOP;
  const wide = width >= TABLET;
  const [loaded, setLoaded] = useState(false);
  const [inPopup, setInPopup] = useState(false);
  const state = useMailState();
  const now = useNow();
  const { people, knownEmails } = usePeople(loaded);
  const [view, setView] = useState<MailView>({ folder: "inbox", tab: "focused" });
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string>();
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [draft, setDraft] = useState<Draft>();
  const [settings, setSettings] = useState(false);
  const [drawer, setDrawer] = useState(false);

  useEffect(() => {
    handleRedirect()
      .then((r) => {
        if (r === "popup") setInPopup(true);
      })
      .catch((e) => showToast(e instanceof Error ? e.message : String(e)));
    ready.then(() => {
      setLoaded(true);
      void syncAll();
    });
    const id = setInterval(() => void syncAll(), 120_000);
    return () => clearInterval(id);
  }, []);

  const opts = useMemo(() => ({ knownEmails }), [knownEmails]);
  const fullView = { ...view, query };
  const threads = useMemo(() => listThreads(state, fullView, now, opts), [state, view, query, now, opts]);
  const counts = useMemo(() => folderCounts(state, now, opts, view.accountId), [state, now, opts, view.accountId]);
  // The open thread, even if an action just moved it out of this view.
  const open = useMemo(() => {
    if (!openId) return undefined;
    return threads.find((x) => x.id === openId) ?? listThreads(state, { folder: "all", query: undefined }, now, opts).find((x) => x.id === openId)
      ?? listThreads(state, { folder: "trash" }, now, opts).find((x) => x.id === openId)
      ?? listThreads(state, { folder: "spam" }, now, opts).find((x) => x.id === openId)
      ?? listThreads(state, { folder: "drafts" }, now, opts).find((x) => x.id === openId);
  }, [openId, threads, state, now, opts]);

  const changeView = (v: MailView) => {
    setView(v);
    setQuery("");
    setChecked(new Set());
    setDrawer(false);
    setOpenId(undefined);
  };

  /** After archive/delete: open the next conversation (wide) or go back to the list (phone). */
  const afterRemove = () => {
    if (!wide) return setOpenId(undefined);
    const i = threads.findIndex((x) => x.id === openId);
    const next = threads[i + 1] ?? threads[i - 1];
    setOpenId(next && next.id !== openId ? next.id : undefined);
  };

  const newDraft = (): Draft => ({
    id: globalThis.crypto.randomUUID(),
    accountId: view.accountId ?? state.accounts.find((a) => a.provider !== "demo")?.id ?? state.accounts[0]?.id ?? "",
    to: [],
    cc: [],
    bcc: [],
    subject: "",
    body: state.signature ? `\n\n${state.signature}` : "",
  });
  const reply = (m: MailMessage, mode: "reply" | "replyAll" | "forward") => setDraft(replyDraft(mailbox.state, m, mode));

  const sendTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const send = (d: Draft) => {
    setDraft(undefined);
    const replyTo = d.threadId ? [...mailbox.state.messages].reverse().find((m) => m.threadId === d.threadId && m.location !== "drafts") : undefined;
    // Hold it for a few seconds so Undo can stop it.
    mailbox.set(saveDraft(mailbox.state, d, new Date()));
    if (sendTimer.current) clearTimeout(sendTimer.current);
    sendTimer.current = setTimeout(async () => {
      try {
        await sendDraft(d, replyTo);
        mailbox.set(recordSent(mailbox.state, d, new Date()));
        showToast("Sent", undefined, 3000);
      } catch (e) {
        showToast(`Not sent: ${e instanceof Error ? e.message : String(e)}. It's in Drafts.`);
      }
    }, UNDO_SEND_MS);
    showToast("Sending…", {
      label: "Undo",
      run: () => {
        if (sendTimer.current) clearTimeout(sendTimer.current);
        hideToast();
        setDraft(d);
      },
    }, UNDO_SEND_MS);
  };

  const toggleCheck = (id: string) =>
    setChecked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const bulk = (a: "archive" | "trash" | "read" | "unread" | "clear" | "all") => {
    const ids = [...checked];
    if (a === "all") return setChecked(new Set(threads.map((x) => x.id)));
    if (a === "archive") act(threadOps.archive(state, ids), `Archived ${ids.length}`);
    if (a === "trash") act(threadOps.trash(state, ids), `Moved ${ids.length} to bin`);
    if (a === "read") act(threadOps.markRead(state, ids, true));
    if (a === "unread") act(threadOps.markRead(state, ids, false));
    setChecked(new Set());
  };

  // Keyboard shortcuts (web): the Gmail ones people already know.
  const keys = useRef<(e: KeyboardEvent) => void>(() => {});
  keys.current = (e: KeyboardEvent) => {
    const el = e.target as HTMLElement | null;
    if (draft || settings || el?.tagName === "INPUT" || el?.tagName === "TEXTAREA" || e.metaKey || e.ctrlKey || e.altKey) return;
    const i = threads.findIndex((x) => x.id === openId);
    const ids = openId ? [openId] : [];
    switch (e.key) {
      case "j": return setOpenId(threads[Math.min(threads.length - 1, i + 1)]?.id);
      case "k": return setOpenId(threads[Math.max(0, i - 1)]?.id);
      case "c": e.preventDefault(); return setDraft(newDraft());
      case "/": e.preventDefault(); return (document.getElementById("inbox-search") as HTMLInputElement | null)?.focus();
      case "Escape": return setOpenId(undefined);
    }
    if (!open) return;
    const latest = [...open.messages].reverse().find((m) => m.location !== "drafts") ?? open.latest;
    switch (e.key) {
      case "e": act(threadOps.archive(state, ids), "Archived"); return afterRemove();
      case "#": act(threadOps.trash(state, ids), "Moved to bin"); return afterRemove();
      case "s": return act(threadOps.star(state, ids, !open.starred));
      case "u": return act(threadOps.markRead(state, ids, false), "Marked unread");
      case "r": e.preventDefault(); return reply(latest, "reply");
      case "a": e.preventDefault(); return reply(latest, "replyAll");
      case "f": e.preventDefault(); return reply(latest, "forward");
    }
  };
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const h = (e: KeyboardEvent) => keys.current(e);
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, []);

  if (inPopup) return <View style={{ flex: 1, backgroundColor: c.bg }} />;
  if (!loaded) return <View style={{ flex: 1, backgroundColor: c.bg }} />;

  const sidebar = (
    <Sidebar t={t} state={state} view={view} counts={counts} onView={changeView} onCompose={() => { setDrawer(false); setDraft(newDraft()); }} onSettings={() => { setDrawer(false); setSettings(true); }} />
  );
  const title = viewTitle(state, fullView);
  const header = wide && desktop ? (
    <Text accessibilityRole="header" style={{ color: c.text, fontSize: 20, fontWeight: "700" }}>{title}</Text>
  ) : (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
      <Button t={t} small kind="plain" label="☰" a11y="Folders and labels" onPress={() => setDrawer(true)} />
      <Text accessibilityRole="header" style={{ flex: 1, color: c.text, fontSize: 20, fontWeight: "700" }}>{title}</Text>
      <Button t={t} small kind="primary" label="Compose" onPress={() => setDraft(newDraft())} />
    </View>
  );
  const list = (
    <ThreadList
      t={t}
      state={state}
      view={view}
      threads={threads}
      now={now}
      selectedId={wide ? openId : undefined}
      checked={checked}
      counts={counts}
      query={query}
      onQuery={setQuery}
      onTab={(tab: Tab) => setView({ ...view, tab })}
      onOpen={(id) => {
        const th = threads.find((x) => x.id === id);
        // A thread that is only a draft opens the draft to keep writing.
        if (th && th.messages.every((m) => m.location === "drafts")) {
          const d = th.messages[th.messages.length - 1]!;
          return setDraft({ id: d.id, accountId: d.accountId, to: d.to, cc: d.cc, bcc: d.bcc ?? [], subject: d.subject, body: d.body });
        }
        setOpenId(id);
      }}
      onCheck={toggleCheck}
      onBulk={bulk}
      header={header}
    />
  );
  const reader = open ? (
    <ThreadView
      key={open.id}
      t={t}
      state={state}
      thread={open}
      now={now}
      people={people}
      sidePanel={width >= 1500}
      onBack={wide ? undefined : () => setOpenId(undefined)}
      onReply={reply}
      onEditDraft={setDraft}
      onDone={afterRemove}
    />
  ) : (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: space.sm, padding: space.xl, backgroundColor: c.surface }}>
      <Text style={{ color: c.text, fontSize: font.size.md, fontWeight: "600" }}>No conversation selected</Text>
      <Text style={{ color: c.textMuted, fontSize: 13, textAlign: "center" }}>
        {Platform.OS === "web" ? "j / k to move, e to archive, c to compose, / to search" : "Pick one from the list"}
      </Text>
    </View>
  );

  const overlays = (
    <>
      {draft ? (
        <Compose
          key={draft.id}
          t={t}
          wide={wide}
          state={state}
          people={people}
          draft={draft}
          onSend={send}
          onSaveDraft={(d) => {
            setDraft(undefined);
            if (d.body.trim() || d.to.length || d.subject.trim()) {
              mailbox.set(saveDraft(mailbox.state, d, new Date()));
              showToast("Saved to Drafts", undefined, 3000);
            }
          }}
          onDiscard={(d) => {
            setDraft(undefined);
            mailbox.set(discardDraft(mailbox.state, d.id));
          }}
        />
      ) : null}
      {settings ? <Settings t={t} state={state} wide={wide} onClose={() => setSettings(false)} /> : null}
      <Modal visible={drawer} transparent animationType="fade" onRequestClose={() => setDrawer(false)}>
        <View style={{ flex: 1, flexDirection: "row" }}>
          <View style={{ width: 280, maxWidth: "85%", backgroundColor: c.bg }}>{sidebar}</View>
          <Pressable accessibilityLabel="Close folders" onPress={() => setDrawer(false)} style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.3)" }} />
        </View>
      </Modal>
      <ToastBar t={t} />
    </>
  );

  if (desktop) {
    return (
      <View style={{ flex: 1, flexDirection: "row", backgroundColor: c.bg }}>
        <View style={{ width: 230, borderRightWidth: 1, borderColor: c.border, backgroundColor: c.bg }}>{sidebar}</View>
        <View style={{ width: 400, borderRightWidth: 1, borderColor: c.border }}>{list}</View>
        <View style={{ flex: 1, minWidth: 0 }}>{reader}</View>
        {overlays}
      </View>
    );
  }
  if (wide) {
    return (
      <View style={{ flex: 1, flexDirection: "row", backgroundColor: c.bg }}>
        <View style={{ width: Math.min(380, width * 0.42), borderRightWidth: 1, borderColor: c.border }}>{list}</View>
        <View style={{ flex: 1, minWidth: 0 }}>{reader}</View>
        {overlays}
      </View>
    );
  }
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      {open ? reader : list}
      {overlays}
    </View>
  );
}

function ToastBar({ t }: { t: Theme }) {
  const toast = useToast();
  if (!toast) return null;
  return (
    <View pointerEvents="box-none" style={{ position: "absolute", left: 0, right: 0, bottom: space.lg, alignItems: "center", paddingHorizontal: space.lg }}>
      <View accessibilityRole="alert" accessibilityLiveRegion="polite" style={{ flexDirection: "row", alignItems: "center", gap: space.md, maxWidth: 520, paddingLeft: space.lg, paddingRight: space.sm, paddingVertical: space.sm, borderRadius: radius.md, backgroundColor: t.dark ? "#ECEEF2" : "#14161A" }}>
        <Text style={{ flexShrink: 1, color: t.dark ? "#14161A" : "#FFFFFF", fontSize: font.size.sm }}>{toast.text}</Text>
        {toast.action ? (
          <Pressable accessibilityRole="button" onPress={toast.action.run} style={{ minHeight: 36, paddingHorizontal: space.md, justifyContent: "center" }}>
            <Text style={{ color: t.dark ? "#3D5AFE" : "#7C8CFF", fontWeight: "700", fontSize: font.size.sm }}>{toast.action.label}</Text>
          </Pressable>
        ) : (
          <Pressable accessibilityRole="button" accessibilityLabel="Dismiss" onPress={hideToast} style={{ minHeight: 36, paddingHorizontal: space.sm, justifyContent: "center" }}>
            <Text style={{ color: t.dark ? "#5E6470" : "#9AA1AD" }}>✕</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}
