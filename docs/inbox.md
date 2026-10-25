# Inbox (email)

A full email app: unified inbox across accounts, threads, Focused / Other,
search, labels, snooze, undo, compose with undo send. Plus what Outlook and
Gmail can't do: an email becomes a task in Today, a note, or a person in
People, and stays linked to them.

Live at https://avrenthrad.github.io/societyos/inbox/ once deployed. Until a
real account is connected it shows a sample mailbox.

## Where things live

- `packages/mail-logic`: no UI, fully tested.
  - `mailbox.ts`: threads for a view (folder, label, account, Focused /
    Other, search), unread counts, and every change as an `Op` (read, star,
    move, label, snooze, delete) so it can be undone and written back to
    Outlook or Gmail. Compose: reply, reply all, forward, drafts.
  - `search.ts`: `from:` `to:` `subject:` `is:unread|read|starred|snoozed`
    `has:attachment` `in:` `label:` `account:` `before:` `after:`
    `"phrases"` `-not`.
  - `detect.ts`: finds dates in an email ("Friday at 7pm", "by Thursday",
    "Nov 12 from 2pm to 3:30pm"), read from the day it was sent. Month names
    only count next to a day number, so "you may" stays a verb.
  - `societyos.ts`: email to task (a time becomes a block, a deadline becomes
    a due date), thread to note, sender to People. Each one writes a core
    `Message` for the email and links to it, so Today, Notes and People show
    where it came from.
  - `providers/`: Outlook (Microsoft Graph), Gmail (Gmail API) and sign-in.
    Both run in the browser with no secret, so nothing sensitive is in this
    public repo.
- `apps/inbox`: the Expo app. Desktop: folders, list, reading pane,
  SocietyOS panel. iPad: list + reading pane, folders in a drawer. Phone:
  list, then the conversation full screen.

## Data

- The mailbox is saved on the device under its own key
  (`societyos:inbox:v1`), not in the shared store, so newsletters never
  weigh down the other apps.
- Only emails turned into something are copied into the shared store
  (as a `Message` with `channel: "email"`).
- Sign-in tokens stay on the device. Remote images in HTML mail are blocked
  until the person taps "Show images".

## Connecting Outlook and Gmail (one-time setup)

Both services only let registered apps read mail. Registering gives a public
"client id" (not a password). Put the ids in GitHub so every build has them:
repo **Settings > Secrets and variables > Actions > Variables**:
`MS_CLIENT_ID` and `GOOGLE_CLIENT_ID`. To test before that, paste them in
the app: **Accounts and settings > App ids** (saved on that device only).

Sign-in address (redirect URI) for both:
`https://avrenthrad.github.io/societyos/inbox/`
(add `http://localhost:8081/` too for local development).

### Microsoft (Outlook, Hotmail, Microsoft 365)

1. https://entra.microsoft.com > **Applications > App registrations > New registration**.
2. Name: `SocietyOS Inbox`. Account types: **Any organizational directory and personal Microsoft accounts**.
3. Redirect URI: platform **Single-page application (SPA)**, the address above. Register.
4. Copy **Application (client) ID**: that's `MS_CLIENT_ID`.
5. **API permissions > Add > Microsoft Graph > Delegated**: `Mail.ReadWrite`, `Mail.Send`, `User.Read`, `offline_access`. No admin consent needed for personal accounts.
6. Later, before other people use it: **Branding & properties > Publisher verification** (needs a free Microsoft Partner Network id). Without it, work accounts may be blocked from signing in.

### Google (Gmail)

1. https://console.cloud.google.com > new project `SocietyOS`.
2. **APIs & Services > Library > Gmail API > Enable**.
3. **Google Auth Platform**: app name, support email. Audience: **External**, status **Testing**; add your Gmail address under **Test users**. Data access: add scopes `gmail.modify`, `email`, `profile`.
4. **Clients > Create client > Web application**. Authorized JavaScript origin: `https://avrenthrad.github.io`. Authorized redirect URI: the address above.
5. Copy the **Client ID**: that's `GOOGLE_CLIENT_ID`.

Gmail reading is a "restricted" scope:
- Testing mode works for up to 100 test users you add by hand. Fine for us.
- Opening it to anyone needs Google's app verification plus a yearly
  third-party security assessment (CASA), typically hundreds to a few
  thousand dollars a year.
- In testing mode Google asks you to sign in again from time to time; the
  app shows "Sign in again" on the account when it does.

### IMAP (iCloud, Yahoo, Fastmail, anything else)

Not yet. Browsers can't open IMAP/SMTP connections, so this needs a small
server (a Supabase Edge Function or similar) that holds the app password and
talks to the mail server. Planned after device sync, behind the same
`MailProvider` interface.

## Not done yet

- IMAP accounts (above).
- Push for new mail: mail syncs on open, every 2 minutes, and on "Sync now".
- Mail deleted on another device stays here until it drops out of the
  recent window; sync reads the newest 50 per folder (Outlook) / 100 (Gmail).
- Attachments are listed but not downloadable yet; sending attachments.
- Rich text compose (plain text for now; HTML mail displays fine).
- Snooze is kept in SocietyOS only (neither API has snooze).
- Sign-in on the native iOS / Android builds (use the installed web app).
- Swipe gestures on phones.
