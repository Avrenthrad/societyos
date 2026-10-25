import type { Address, MailMessage, MailState } from "./types.js";

/**
 * A sample mailbox so Inbox works before any real account is connected.
 * Built relative to `now`, so "tomorrow at 3pm" always means something.
 */

export const DEMO_PERSONAL = "demo-personal";
export const DEMO_WORK = "demo-work";

const me = { personal: { name: "You", email: "you@personal.demo" }, work: { name: "You", email: "you@work.demo" } };

const P = {
  sam: { name: "Sam Lee", email: "sam.lee@example.com" },
  mum: { name: "Mum", email: "mum@example.com" },
  priya: { name: "Priya Shah", email: "priya@acme.example" },
  tom: { name: "Tom Becker", email: "tom@acme.example" },
  alex: { name: "Alex Chen", email: "alex.chen@example.com" },
  dentist: { name: "Harbour Dental", email: "bookings@harbourdental.example" },
  airline: { name: "Qantas", email: "no-reply@qantas.example" },
  bank: { name: "Bank Alerts", email: "alerts@bank.example" },
  news: { name: "The Morning Brief", email: "newsletter@morningbrief.example" },
  github: { name: "GitHub", email: "notifications@github.example" },
  shop: { name: "Bookshop", email: "orders@bookshop.example" },
  gym: { name: "Fit Club", email: "hello@fitclub.example" },
  landlord: { name: "Jordan (Landlord)", email: "jordan.property@example.com" },
} satisfies Record<string, Address>;

export function demoMailbox(now: Date = new Date()): MailState {
  const at = (daysAgo: number, h: number, m = 0) =>
    new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysAgo, h, m).toISOString();
  const minsAgo = (n: number) => new Date(now.getTime() - n * 60_000).toISOString();
  let n = 0;
  const messages: MailMessage[] = [];
  const add = (thread: string, account: "personal" | "work", m: Partial<MailMessage> & Pick<MailMessage, "from" | "subject" | "body" | "date">) => {
    n++;
    const accountId = account === "personal" ? DEMO_PERSONAL : DEMO_WORK;
    messages.push({
      id: `demo-${n}`,
      accountId,
      threadId: `demo-t-${thread}`,
      to: [me[account]],
      cc: [],
      read: true,
      starred: false,
      location: "inbox",
      labels: [],
      attachments: [],
      messageIdHeader: `<demo-${n}@societyos.demo>`,
      ...m,
    });
  };
  const fromMe = (account: "personal" | "work") => me[account];

  add("dinner", "personal", {
    from: P.sam,
    subject: "Dinner Friday?",
    body: "Hey!\n\nAre you free for dinner Friday at 7pm? Thinking that new Thai place on King St.\n\nSam",
    date: at(1, 18, 12),
  });
  add("dinner", "personal", {
    from: fromMe("personal"),
    to: [P.sam],
    subject: "Re: Dinner Friday?",
    body: "Yes! Friday works. Want me to book?",
    date: at(1, 19, 3),
    location: "sent",
  });
  add("dinner", "personal", {
    from: P.sam,
    subject: "Re: Dinner Friday?",
    body: "Booked for 7pm under Lee. Alex might come too.\n\nSee you then!",
    date: minsAgo(42),
    read: false,
    labels: ["l-family"],
  });

  add("report", "work", {
    from: P.priya,
    cc: [P.tom],
    subject: "Q3 report",
    body: "Hi,\n\nCan you send me the Q3 numbers by Thursday? I need them for the board pack.\n\nAlso, let's do a quick review tomorrow from 2pm to 2:30pm.\n\nThanks,\nPriya",
    date: minsAgo(95),
    read: false,
    starred: true,
    labels: ["l-work"],
    attachments: [{ id: "a1", name: "Q3-template.xlsx", mimeType: "application/vnd.ms-excel", sizeBytes: 48_213 }],
  });

  add("dentist", "personal", {
    from: P.dentist,
    subject: "Appointment reminder",
    body: "Hi,\n\nThis is a reminder of your check-up next Tuesday at 3:30pm with Dr Patel.\n\nReply C to confirm or call us to reschedule.\n\nHarbour Dental",
    date: at(0, 8, 2),
    read: false,
  });

  add("rent", "personal", {
    from: P.landlord,
    subject: "Inspection next week",
    body: "Hi there,\n\nJust letting you know the routine inspection is booked for Wed at 10am. You don't need to be home.\n\nAlso a reminder the lease renewal form is due by the 15th of next month.\n\nCheers,\nJordan",
    date: at(2, 11, 40),
  });

  add("flight", "personal", {
    from: P.airline,
    subject: "Your trip to Melbourne: booking confirmed",
    body: "Booking reference QF7Z2K\n\nSYD to MEL, QF 415\nDeparts 7:00am, arrives 8:35am\n\nCheck in opens 24 hours before departure.",
    date: at(3, 9, 15),
    labels: ["l-travel"],
    listUnsubscribe: "<mailto:unsub@qantas.example>",
    attachments: [{ id: "a2", name: "itinerary.pdf", mimeType: "application/pdf", sizeBytes: 120_400 }],
  });

  add("standup", "work", {
    from: P.tom,
    subject: "Standup moved",
    body: "Team, standup is moving to 9:30am from Monday so Priya can join from London.",
    date: at(1, 16, 5),
    labels: ["l-work"],
  });
  add("standup", "work", {
    from: P.priya,
    subject: "Re: Standup moved",
    body: "Thanks Tom, appreciated.",
    date: at(1, 16, 30),
    labels: ["l-work"],
  });

  add("mum", "personal", {
    from: P.mum,
    subject: "Sunday lunch",
    body: "Hi love,\n\nAre you still coming for lunch on Sunday? Dad's doing a roast. Bring the photos from the trip!\n\nLove Mum xx",
    date: at(2, 20, 15),
    read: false,
    labels: ["l-family"],
  });

  add("offsite", "work", {
    from: P.alex,
    subject: "Offsite planning",
    body: "Hi both,\n\nProposed dates for the offsite: 12 November or 19 November. Venue options attached.\n\nCan everyone vote by Friday?\n\nAlex",
    to: [me.work, P.priya],
    date: at(4, 10, 0),
    labels: ["l-work"],
    attachments: [{ id: "a3", name: "venues.pdf", mimeType: "application/pdf", sizeBytes: 2_310_000 }],
  });

  add("pr", "work", {
    from: P.github,
    subject: "[societyos] Review requested on #12",
    body: "Priya requested your review on: Add CSV import for Finance.\n\nView it on GitHub.",
    date: minsAgo(180),
    read: false,
    listUnsubscribe: "<https://github.example/unsub>",
  });

  add("news1", "personal", {
    from: P.news,
    subject: "Monday: rates, rugby and a recipe",
    body: "Good morning. Here's what you need to know today...\n\nUnsubscribe at any time.",
    date: at(0, 6, 0),
    read: false,
    listUnsubscribe: "<https://morningbrief.example/u>",
  });
  add("news2", "personal", {
    from: P.news,
    subject: "Weekend edition",
    body: "The best reads of the week, plus the crossword.",
    date: at(3, 6, 0),
    listUnsubscribe: "<https://morningbrief.example/u>",
  });

  add("bank", "personal", {
    from: P.bank,
    subject: "Your statement is ready",
    body: "Your October statement is now available. Your credit card payment of $482.10 is due on 3 November.",
    date: at(1, 7, 30),
    labels: ["l-receipts"],
  });

  add("order", "personal", {
    from: P.shop,
    subject: "Order #10482 has shipped",
    body: "Good news, your order has shipped!\n\n1 x The Overstory (paperback) $24.99\nShipping $0.00\nTotal $24.99\n\nExpected delivery: tomorrow.",
    date: at(1, 13, 45),
    labels: ["l-receipts"],
    listUnsubscribe: "<mailto:unsub@bookshop.example>",
  });

  add("gym", "personal", {
    from: P.gym,
    subject: "New classes this month",
    body: "We've added early morning spin classes, Mon and Thu at 6am. Book in the app.",
    date: at(5, 9, 0),
    listUnsubscribe: "<https://fitclub.example/u>",
  });

  add("welcome", "personal", {
    from: { name: "SocietyOS", email: "hello@societyos.demo" },
    subject: "Welcome to Inbox",
    body: [
      "This is a sample mailbox so you can try everything before connecting a real account.",
      "",
      "Things to try:",
      "- Open the dinner email from Sam and tap the green date to put it in Today.",
      "- Open \"Q3 report\" and make it a task with its deadline.",
      "- Add a sender to People from the SocietyOS panel.",
      "- Search: from:priya, is:unread, has:attachment, label:work.",
      "- Archive, snooze, star and label from the toolbar. Undo is in the bar at the bottom.",
      "- Keyboard on a computer: j and k to move, e archive, s star, r reply, c compose, / search.",
      "",
      "Connect Outlook or Gmail in \"Accounts and settings\".",
    ].join("\n"),
    date: minsAgo(5),
    read: false,
  });

  add("sent1", "work", {
    from: fromMe("work"),
    to: [P.tom],
    subject: "Slides for Thursday",
    body: "Hi Tom, slides attached. Let me know if anything needs changing.",
    date: at(2, 15, 20),
    location: "sent",
    attachments: [{ id: "a4", name: "roadmap.key", mimeType: "application/octet-stream", sizeBytes: 5_400_000 }],
  });

  add("old", "personal", {
    from: P.alex,
    subject: "Photos from the hike",
    body: "Finally got around to uploading them. Link below!",
    date: at(9, 19, 0),
    location: "archive",
  });

  add("spam", "personal", {
    from: { name: "Prize Team", email: "winner@totally-legit.example" },
    subject: "You have WON a $1000 gift card!!!",
    body: "Click here to claim your prize now.",
    date: at(1, 3, 12),
    location: "spam",
    read: false,
  });

  return {
    version: 1,
    accounts: [
      { id: DEMO_PERSONAL, provider: "demo", email: me.personal.email, name: "Personal (sample)", color: "#3D5AFE" },
      { id: DEMO_WORK, provider: "demo", email: me.work.email, name: "Work (sample)", color: "#EF6C00" },
    ],
    labels: [
      { id: "l-work", name: "Work", color: "#EF6C00" },
      { id: "l-family", name: "Family", color: "#8E24AA" },
      { id: "l-receipts", name: "Receipts", color: "#00897B" },
      { id: "l-travel", name: "Travel", color: "#1E88E5" },
    ],
    messages,
    tabOverrides: {},
    shared: {},
    signature: "",
  };
}

/** Sample people for People, so sender matching has something to match. */
export const demoPeople: Address[] = [P.sam, P.mum, P.priya];
