# Finance (lite)

Spending, money in, receipts and bills, joined to the rest of SocietyOS.
No bank feeds yet: type it, snap it, or import a bank CSV.

Live at https://avrenthrad.github.io/societyos/finance/ (install it on a
phone the same way as Today, see `deploy.md`).

## The rules

- **Bills are tasks.** Adding a bill makes one repeating task in Today
  ("Pay Rent · $520.00"). The task's due date is the bill's due date, so
  they never disagree. Pay it in Finance and the task ticks off and moves
  to next time; tick it off in Today and Finance asks to record the payment.
- **Capture once.** "Dinner with Sam 86 at The Grounds" links the spend to
  Sam (shows on Sam's timeline in People) and to The Grounds, and offers
  the "Dinner with Sam" event from Today that evening with one tap.
- **Categories learn.** Fix one and every other spend from the same
  merchant follows, now and on later imports.
- Amounts are whole cents; negative is money out.

## Where things live

- `packages/finance-logic`: no UI, fully tested.
  - `entry.ts`: quick entry. Amount, money in ("+2500", "refund"),
    date and repeats (Today's parser, plus "yesterday"), known people,
    "with <new person>", "at <place>", "#category". Each piece is a chip
    that can be undone.
  - `csv.ts`: CSV parser, column and date-order guessing (headerless
    CommBank-style files too), preview, and `importKey` so importing the
    same statement twice adds nothing.
  - `categorize.ts`: merchant keys, learned categories, common AU merchants.
  - `bills.ts`: create, pay, record-from-Today, stop. Built on Today's
    `completeTask`, so repeats move exactly like any other task.
  - `summary.ts`: month totals (transfers left out), spend by category,
    person and place, matching events.
  - `save.ts`: saving entries and imports, and the links:
    `related` (person, event), `located-at` (place), `attached` (receipt).
- `apps/finance`: the Expo app. Desktop: menu, view, details. iPad:
  activity or bills beside overview or details. Phone: tabs, quick add
  at the bottom, details in a sheet.

## Receipts

Photos are shrunk to 1600px and kept in the browser's IndexedDB; the
`file` row (linked `attached`) syncs like everything else. Once Supabase
Storage is set up they upload there. Scanning totals from the photo is a
later step.

## Not done yet

- Bank feeds (needs an open-banking provider such as Basiq).
- Receipt scanning (read the total and merchant from the photo).
- Budgets, multiple currencies, splitting a bill with people.
- Editing a bill's due date from Finance (move the task in Today for now).
