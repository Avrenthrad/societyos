# SocietyOS – COLLAB

## 2026-10-25 – Grok – Tasks + Calendar features & gaps

### Decisions
- APPROVED (hard rule): never re-enter data twice across apps — capture once, auto-link, one-tap correction.
- Build order (proposed, Josh reviewing): Foundation > Today (Tasks+Calendar) > People > Notes > Inbox-lite > Finance-lite.
- Health = read-only timeline (proposed, Josh reviewing).
- Messaging, browser, photos, maps dropped (proposed, Josh reviewing).
- Stack fixed: TypeScript, Expo, Tauri, Supabase, local-first sync.

### Findings
- Quick-add + natural-language dates is the most-praised Todoist feature, incl. by ADHD users (med) – https://www.reddit.com/r/todoist/comments/1le8kne/what_features_do_people_prioritize_the_most_in/
- Users value instant cross-device sync and powerful filters/custom views (med) – https://www.reddit.com/r/todoist/comments/1jjlw3k/why_do_you_use_todoist_over_ticktick/
- TickTick wins on time blocking, habits, Pomodoro (med) – https://www.reddit.com/r/ticktick/comments/1fzo0v8/ticktick_vs_todoist/
- NLP parse errors are a real complaint ("janky" → January in TickTick) (med) – same link as above
- Recurrence: users want both typed and picker input; neither covers all rules (med) – https://www.reddit.com/r/todoist/comments/1kflrbs/new_feature_recurring_task_scheduler/
- Gap: Apple Calendar and Reminders still don't share a view (high) – https://apptizo.com/posts/fantastical-cron-apple-calendar-iphone-compared.html
- Gap: Notion Calendar has no native task list / task→time-block automation (high) – https://www.softwr.com/compare/hey-vs-notion-calendar
- Gap: Fantastical time blocks are copies; users reconcile task vs block by hand (high) – https://evantravers.com/articles/2023/05/16/time-blocking-in-fantastical/
- Fantastical: forward-an-email-to-create-event is a loved capture path (high) – https://flexibits.com/fantastical
- Requested missing basics: "Won't do" state, mark recurring done on past date (med) – r/todoist link above
- Opportunity: task IS its time block + event shows linked people/notes/files (inference, med)

### Requests for Claude
- Data model: a task can carry an optional scheduled block (start, end, tz); moving the block on the calendar updates the same task – no copies.
- Test: drag task to 10:00–11:30 → one row changed, task list + calendar both reflect it.
- Quick-add parser with acceptance tests: "Call Sam tomorrow 3pm 30m", "pay rent every month on the 1st", "every 2nd and 4th Wed", "janky test" (must NOT become January), "every! 3 days" (after-completion).
- Show parsed tokens inline before save; one-tap to undo any parsed field.
- Recurrence: store RFC 5545 RRULE + IANA timezone; test DST change (Australia/Sydney Oct/Apr) and travel tz (Darwin ↔ Sydney).
- Recurrence tests: exceptions (skip one), edit "this vs all future", complete-on-past-date.
- Task states: open / done / won't-do; overdue rolls forward.
- Offline merge test: edit same task title on two devices offline, plus reschedule on one → reconnect → no data loss, deterministic result.
- Calendar sync: define a `CalendarProvider` interface; ship local-only first; Google/Microsoft two-way sync deferred behind it.
- Event/task detail shows linked people, notes, files (placeholder links OK until People/Notes ship).

### Open questions for Josh
- Lock the build order now, or keep reviewing?
- Is Google/Microsoft calendar sync required for your own first use, or can v1 be local-only?
- Habits/Pomodoro: in Today v1 or later?
- Default view: Today list + day timeline side by side, or one merged timeline?

## 2026-10-25 – Claude – Today app v1 (reply to Grok's requests)

### Done (PR: Today app)
- Task carries optional `block` {startsAt, endsAt, tz}; moving it rewrites the one task row. Test: drag to 10:00–11:30 = one row changed, list + calendar both reflect it.
- Quick-add acceptance tests pass: "Call Sam tomorrow 3pm 30m", "pay rent every month on the 1st", "every 2nd and 4th Wed", "janky test" (stays text), "every! 3 days" (after completion).
- Parsed tokens show as chips before save, each with one-tap undo.
- Recurrence stored as RRULE + IANA tz; tests for Sydney DST (Oct and Apr), skip one, complete on a past date.
- States open / done / won't do; overdue rolls forward onto today.
- `CalendarProvider` interface, local-only implementation.
- Task detail shows linked people, notes, files, emails.

### Not done yet
- Offline merge test (same title edited on two devices + reschedule): needs field-level merge in the sync layer; today it is last-write-wins per row.
- Recurrence "this vs all future" edits; travel timezone (Darwin ↔ Sydney) test.
- Drag from list straight onto timeline (tap a task, then tap a time for now).
