import { MemoryStore, linksFor } from "@societyos/sync";
import { describe, expect, it } from "vitest";
import { demoMailbox } from "./demo.js";
import { detectDates } from "./detect.js";
import { listThreads } from "./mailbox.js";
import { b64urlDecode, b64urlEncode, buildRaw, fromGmail, GmailProvider } from "./providers/gmail.js";
import { fromGraph, GraphProvider } from "./providers/graph.js";
import { googleAuthUrl, microsoftAuthUrl, pkceChallenge, readRedirect } from "./providers/auth.js";
import { AuthExpiredError, htmlToText } from "./providers/provider.js";
import { addToPeople, emailToTask, findPerson, madeFrom, shareMessage, threadToNote } from "./societyos.js";
import type { MailAccount } from "./types.js";

/** A fake fetch that records calls and answers from a table of url prefixes. */
function fakeFetch(routes: Record<string, unknown>, status = 200) {
  const calls: { url: string; method: string; body?: unknown }[] = [];
  const f = (async (url: string, init: RequestInit = {}) => {
    calls.push({ url, method: init.method ?? "GET", body: init.body ? JSON.parse(String(init.body)) : undefined });
    const key = Object.keys(routes).find((k) => url.includes(k));
    const body = key ? routes[key] : {};
    return new Response(JSON.stringify(body), { status });
  }) as typeof fetch;
  return { f, calls };
}

const outlook: MailAccount = { id: "o", provider: "outlook", email: "me@outlook.com", name: "Me", color: "#000" };
const gmail: MailAccount = { id: "g", provider: "gmail", email: "me@gmail.com", name: "Me", color: "#000" };

describe("Outlook (Microsoft Graph)", () => {
  const g = {
    id: "AAMk1",
    conversationId: "conv1",
    subject: "Lunch",
    from: { emailAddress: { name: "Sam", address: "Sam@Example.com" } },
    toRecipients: [{ emailAddress: { address: "me@outlook.com" } }],
    receivedDateTime: "2026-10-24T01:00:00Z",
    isRead: false,
    flag: { flagStatus: "flagged" },
    body: { contentType: "html", content: "<p>Lunch <b>Friday</b> at 1pm?</p>" },
    categories: ["Family"],
    attachments: [{ id: "x", name: "menu.pdf", contentType: "application/pdf", size: 10 }],
  };

  it("maps a Graph message", () => {
    const m = fromGraph(g, "o", "inbox");
    expect(m).toMatchObject({ remoteId: "AAMk1", threadId: "o:conv1", read: false, starred: true, labels: ["cat:Family"], body: "Lunch Friday at 1pm?" });
    expect(m.from).toEqual({ name: "Sam", email: "sam@example.com" });
    expect(m.attachments[0]!.name).toBe("menu.pdf");
  });

  it("fetches every folder with immutable ids", async () => {
    const { f, calls } = fakeFetch({ "/messages?": { value: [g] } });
    const p = new GraphProvider(async () => "tok", f);
    const msgs = await p.fetchRecent(outlook, { perFolder: 5 });
    expect(msgs.map((m) => m.location).sort()).toEqual(["archive", "drafts", "inbox", "sent", "spam", "trash"]);
    expect(calls).toHaveLength(6);
    expect(calls[0]!.url).toContain("$top=5");
  });

  it("writes changes back", async () => {
    const { f, calls } = fakeFetch({});
    const p = new GraphProvider(async () => "tok", f);
    const m = fromGraph(g, "o", "inbox");
    await p.apply({ kind: "move", ids: [m.id], to: "trash" }, [m]);
    await p.apply({ kind: "read", ids: [m.id], read: true }, [m]);
    await p.apply({ kind: "label", ids: [m.id], labelId: "cat:Work", on: true }, [m]);
    expect(calls.map((c) => `${c.method} ${c.url.split("/v1.0")[1]}`)).toEqual([
      "POST /me/messages/AAMk1/move",
      "PATCH /me/messages/AAMk1",
      "PATCH /me/messages/AAMk1",
    ]);
    expect(calls[0]!.body).toEqual({ destinationId: "deleteditems" });
    expect(calls[2]!.body).toEqual({ categories: ["Family", "Work"] });
  });

  it("replies in the conversation without double quoting", async () => {
    const { f, calls } = fakeFetch({});
    const p = new GraphProvider(async () => "tok", f);
    const m = fromGraph(g, "o", "inbox");
    await p.send(outlook, { id: "d", accountId: "o", to: [m.from], cc: [], bcc: [], subject: "Re: Lunch", body: "Yes!\n\nOn Fri, Sam wrote:\n> Lunch?", threadId: m.threadId }, m);
    expect(calls[0]!.url).toContain("/me/messages/AAMk1/reply");
    expect((calls[0]!.body as { comment: string }).comment).toBe("Yes!");
  });

  it("an expired sign-in is its own error", async () => {
    const { f } = fakeFetch({}, 401);
    await expect(new GraphProvider(async () => "tok", f).profile()).rejects.toBeInstanceOf(AuthExpiredError);
  });
});

describe("Gmail", () => {
  const raw = {
    id: "m1",
    threadId: "t1",
    labelIds: ["INBOX", "UNREAD", "Label_7"],
    internalDate: String(Date.UTC(2026, 9, 24, 1)),
    payload: {
      mimeType: "multipart/mixed",
      headers: [
        { name: "From", value: "Sam Lee <sam@example.com>" },
        { name: "To", value: "me@gmail.com" },
        { name: "Subject", value: "Café plans" },
        { name: "Message-ID", value: "<abc@mail>" },
        { name: "List-Unsubscribe", value: "<mailto:u@x>" },
      ],
      parts: [
        { mimeType: "text/plain", body: { data: b64urlEncode("Coffee tomorrow at 9am? ☕") } },
        { mimeType: "application/pdf", filename: "map.pdf", body: { attachmentId: "att1", size: 99 } },
      ],
    },
  };

  it("maps a Gmail message, UTF-8 included", () => {
    const m = fromGmail(raw, "g");
    expect(m).toMatchObject({ remoteId: "m1", threadId: "g:t1", location: "inbox", read: false, labels: ["gl:Label_7"], body: "Coffee tomorrow at 9am? ☕", subject: "Café plans" });
    expect(m.attachments).toEqual([{ id: "att1", name: "map.pdf", mimeType: "application/pdf", sizeBytes: 99 }]);
    expect(m.listUnsubscribe).toBe("<mailto:u@x>");
    expect(fromGmail({ ...raw, labelIds: ["SENT"] }, "g").location).toBe("sent");
    expect(fromGmail({ ...raw, labelIds: [] }, "g").location).toBe("archive");
    expect(fromGmail({ ...raw, labelIds: ["INBOX", "TRASH"] }, "g").location).toBe("trash");
  });

  it("builds a reply that threads", () => {
    const m = fromGmail(raw, "g");
    const out = b64urlDecode(buildRaw({ name: "Me", email: "me@gmail.com" }, { id: "d", accountId: "g", to: [m.from], cc: [], bcc: [], subject: "Re: Café plans", body: "Sure ☕" }, m));
    expect(out).toContain("In-Reply-To: <abc@mail>");
    expect(out).toContain("To: Sam Lee <sam@example.com>");
    expect(out).toMatch(/Subject: =\?UTF-8\?B\?/);
    const body = out.split("\r\n\r\n")[1]!.replace(/\r\n/g, "");
    expect(new TextDecoder().decode(Uint8Array.from(atob(body), (c) => c.charCodeAt(0)))).toBe("Sure ☕");
  });

  it("sends replies into the same thread and archives by removing INBOX", async () => {
    const { f, calls } = fakeFetch({});
    const p = new GmailProvider(async () => "tok", f);
    const m = fromGmail(raw, "g");
    await p.send(gmail, { id: "d", accountId: "g", to: [m.from], cc: [], bcc: [], subject: "Re", body: "ok" }, m);
    expect((calls[0]!.body as { threadId: string }).threadId).toBe("t1");
    await p.apply({ kind: "move", ids: [m.id], to: "archive" }, [m]);
    expect(calls[1]!.body).toEqual({ addLabelIds: [], removeLabelIds: ["INBOX", "SPAM"] });
  });

  it("lists then fetches each message", async () => {
    const { f, calls } = fakeFetch({ "/messages?": { messages: [{ id: "m1" }] }, "/messages/m1": raw });
    const msgs = await new GmailProvider(async () => "tok", f).fetchRecent(gmail, { perFolder: 10 });
    expect(msgs).toHaveLength(1);
    expect(calls[0]!.url).toContain("maxResults=20&includeSpamTrash=true");
  });
});

describe("sign-in", () => {
  const cfg = { clientId: "abc", redirectUri: "https://avrenthrad.github.io/societyos/inbox/" };

  it("Microsoft: code flow with PKCE", async () => {
    const url = new URL(await microsoftAuthUrl(cfg, "st", "verifier"));
    expect(url.searchParams.get("code_challenge")).toBe(await pkceChallenge("verifier"));
    expect(url.searchParams.get("scope")).toContain("Mail.Send");
    expect(readRedirect(`${cfg.redirectUri}?code=xyz&state=st`)).toEqual({ kind: "code", code: "xyz", state: "st" });
  });

  it("Google: token flow, silent renew", () => {
    const url = new URL(googleAuthUrl(cfg, "st", { silent: true }));
    expect(url.searchParams.get("prompt")).toBe("none");
    expect(url.searchParams.get("scope")).toContain("gmail.modify");
    expect(readRedirect(`${cfg.redirectUri}#access_token=t&expires_in=3599&state=st`)).toEqual({ kind: "token", accessToken: "t", expiresIn: 3599, state: "st" });
    expect(readRedirect(`${cfg.redirectUri}#error=interaction_required&state=st`)).toMatchObject({ kind: "error", state: "st" });
    expect(readRedirect(cfg.redirectUri)).toBeUndefined();
  });

  it("html to text", () => {
    expect(htmlToText("<style>x{}</style><p>Hi&nbsp;there</p><ul><li>One</li></ul>")).toBe("Hi there\n- One");
  });
});

describe("SocietyOS: email to task, note and person", () => {
  const base = { ownerId: "u", sourceApp: "inbox" };
  const now = new Date(2026, 9, 25, 10);

  it("turns an email with a time into a task block in Today, linked both ways", async () => {
    const store = new MemoryStore();
    const state = demoMailbox(now);
    const sam = await addToPeople(store, { name: "Sam Lee", email: "SAM.LEE@example.com" }, base);
    const msg = state.messages.find((m) => m.subject === "Dinner Friday?")!;
    const when = detectDates(msg.body, new Date(msg.date))[0]!;
    const { task, state: next } = await emailToTask(store, state, msg, base, { when });
    expect(task.title).toBe("Dinner Friday?");
    expect(new Date(task.block!.startsAt).getHours()).toBe(19);
    expect((new Date(task.block!.endsAt).getTime() - new Date(task.block!.startsAt).getTime()) / 60000).toBe(30);
    const shared = await store.get("message", next.shared[msg.id]!);
    expect(shared).toMatchObject({ channel: "email", fromId: sam.id, subject: "Dinner Friday?" });
    // Today's task detail finds the email; People finds the email on Sam.
    expect((await linksFor(store, task.id)).map((l) => l.relation).sort()).toEqual(["created-from", "mentions"]);
    expect((await linksFor(store, sam.id)).length).toBeGreaterThanOrEqual(2);
    expect((await madeFrom(store, next, [msg.id])).map((e) => e.id)).toEqual([task.id]);
  });

  it("a deadline becomes a due date, not a block", async () => {
    const store = new MemoryStore();
    const state = demoMailbox(now);
    const msg = state.messages.find((m) => m.subject === "Q3 report")!;
    const when = detectDates(msg.body, new Date(msg.date)).find((d) => d.deadline)!;
    const { task } = await emailToTask(store, state, msg, base, { when, title: "Send Q3 numbers to Priya" });
    expect(task.block).toBeUndefined();
    expect(task.dueAllDay).toBe(true);
    expect(new Date(task.dueAt!).getDay()).toBe(4);
    expect(task.title).toBe("Send Q3 numbers to Priya");
  });

  it("shares each email once, and saves threads as notes", async () => {
    const store = new MemoryStore();
    let state = demoMailbox(now);
    const thread = listThreads(state, { folder: "inbox" }, now).find((t) => t.subject === "Dinner Friday?")!;
    const latest = thread.messages.at(-1)!;
    const a = await shareMessage(store, state, latest, base);
    const b = await shareMessage(store, a.state, latest, base);
    expect(b.message.id).toBe(a.message.id);
    state = b.state;
    const { note } = await threadToNote(store, state, thread.messages, base);
    expect(note.body).toContain("Thai place");
    expect(note.tags).toEqual(["email"]);
    expect(await store.list("message")).toHaveLength(1);
  });

  it("adding a sender twice finds the same person", async () => {
    const store = new MemoryStore();
    const a = await addToPeople(store, { name: "Priya", email: "priya@acme.example" }, base);
    const b = await addToPeople(store, { email: "PRIYA@acme.example" }, base);
    expect(b.id).toBe(a.id);
    expect(findPerson(await store.list("person"), { email: "Priya@Acme.example" })?.id).toBe(a.id);
  });
});
