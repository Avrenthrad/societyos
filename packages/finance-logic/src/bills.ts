import { createEntity, type Bill, type ID, type Recurrence, type Task, type Transaction } from "@societyos/core";
import { link, type Store } from "@societyos/sync";
import { completeTask, daysBetween, startOfDay } from "@societyos/today-logic";
import { formatMoney } from "./money.js";

/**
 * Bills are tasks. Adding a bill makes one repeating task in Today
 * ("Pay rent · $520.00"), and the task's due date IS the bill's due date.
 * Pay it here and the task ticks off and moves to next time; tick it off
 * in Today and Finance offers to record the payment.
 */

type Owner = { ownerId: ID; sourceApp: string };

export interface NewBill {
  name: string;
  amountMinor: number;
  currency: string;
  /** First (or only) due date. */
  dueAt: Date;
  /** Leave out for a one-off bill. */
  recurrence?: Recurrence;
  category?: string;
  autopay?: boolean;
}

export const billTaskTitle = (name: string, amountMinor: number, currency: string) =>
  `Pay ${name} · ${formatMoney(Math.abs(amountMinor), currency)}`;

export async function createBill(store: Store, b: NewBill, owner: Owner) {
  const task = createEntity("task", {
    ...owner,
    title: billTaskTitle(b.name, b.amountMinor, b.currency),
    status: "open",
    dueAt: startOfDay(b.dueAt).toISOString(),
    dueAllDay: true,
    recurrence: b.recurrence,
    priority: 1,
    projectId: "Bills",
  });
  const bill = createEntity("bill", {
    ...owner,
    name: b.name,
    amountMinor: Math.abs(b.amountMinor),
    currency: b.currency,
    category: b.category ?? "Bills",
    taskId: task.id,
    autopay: b.autopay,
  });
  await store.put(task);
  await store.put(bill);
  await link(store, task, bill, "created-from", owner);
  return { bill, task };
}

/** When the reminder task last got ticked off, in Today or here. */
function doneAt(task: Task): string | undefined {
  return task.lastDoneAt ?? (task.status === "done" ? task.closedAt : undefined);
}

export type BillState = "overdue" | "due-soon" | "upcoming" | "paid" | "stopped";

export interface BillStatus {
  bill: Bill;
  task?: Task;
  nextDue?: Date;
  state: BillState;
  /** Days until due (negative when late). */
  inDays?: number;
  /** Ticked off in Today but no payment recorded yet. */
  unrecorded?: Date;
}

const SOON_DAYS = 3;

export function billStatus(bill: Bill, task: Task | undefined, now: Date = new Date()): BillStatus {
  const done = task && doneAt(task);
  const unrecorded = done && (!bill.recordedAt || done > bill.recordedAt) ? new Date(done) : undefined;
  if (!task || task.status === "wont-do") return { bill, task, state: "stopped", unrecorded };
  if (task.status === "done") return { bill, task, state: "paid", unrecorded };
  const nextDue = task.dueAt ? new Date(task.dueAt) : undefined;
  const inDays = nextDue ? daysBetween(now, nextDue) : undefined;
  const state: BillState = inDays === undefined ? "upcoming" : inDays < 0 ? "overdue" : inDays <= SOON_DAYS ? "due-soon" : "upcoming";
  return { bill, task, nextDue, inDays, state, unrecorded };
}

/** Every bill with its reminder task, soonest first. */
export async function listBills(store: Store, now: Date = new Date()): Promise<BillStatus[]> {
  const bills = await store.list("bill");
  const out: BillStatus[] = [];
  for (const b of bills) out.push(billStatus(b, await store.get("task", b.taskId), now));
  const order: Record<BillState, number> = { overdue: 0, "due-soon": 1, upcoming: 2, paid: 3, stopped: 4 };
  return out.sort(
    (a, b) => order[a.state] - order[b.state] || (a.nextDue?.getTime() ?? Infinity) - (b.nextDue?.getTime() ?? Infinity),
  );
}

async function recordPayment(store: Store, bill: Bill, on: Date, amountMinor: number, owner: Owner) {
  const tx = createEntity("transaction", {
    ...owner,
    amountMinor: -Math.abs(amountMinor),
    currency: bill.currency,
    occurredAt: on.toISOString(),
    description: bill.name,
    category: bill.category ?? "Bills",
    billId: bill.id,
  });
  await store.put(tx);
  await link(store, tx, bill, "related", owner);
  return tx;
}

/**
 * Pay a bill: records the spend and ticks the task off in Today (a
 * repeating bill's task moves to its next due date).
 */
export async function payBill(
  store: Store,
  bill: Bill,
  opts: Owner & { on?: Date; amountMinor?: number },
): Promise<{ transaction: Transaction; task?: Task; bill: Bill }> {
  const on = opts.on ?? new Date();
  const owner = { ownerId: opts.ownerId, sourceApp: opts.sourceApp };
  const transaction = await recordPayment(store, bill, on, opts.amountMinor ?? bill.amountMinor, owner);
  const current = await store.get("task", bill.taskId);
  const task = current ? await completeTask(store, current, on) : undefined;
  const next: Bill = { ...bill, recordedAt: task ? doneAt(task) ?? on.toISOString() : on.toISOString() };
  await store.put(next);
  return { transaction, task, bill: next };
}

/** It was ticked off in Today: save the payment it stands for. */
export async function recordFromToday(store: Store, status: BillStatus, opts: Owner & { amountMinor?: number }) {
  if (!status.unrecorded) return undefined;
  const owner = { ownerId: opts.ownerId, sourceApp: opts.sourceApp };
  const transaction = await recordPayment(store, status.bill, status.unrecorded, opts.amountMinor ?? status.bill.amountMinor, owner);
  const bill: Bill = { ...status.bill, recordedAt: status.unrecorded.toISOString() };
  await store.put(bill);
  return { transaction, bill };
}

/** Change a bill's name or amount; the task in Today follows. */
export async function updateBill(store: Store, bill: Bill, changes: Partial<Pick<Bill, "name" | "amountMinor" | "category" | "autopay">>) {
  const next: Bill = { ...bill, ...changes };
  await store.put(next);
  const task = await store.get("task", bill.taskId);
  if (task) await store.put({ ...task, title: billTaskTitle(next.name, next.amountMinor, next.currency) });
  return next;
}

/** Stop a bill: its task becomes "won't do" so Today stops reminding. */
export async function stopBill(store: Store, bill: Bill) {
  const task = await store.get("task", bill.taskId);
  if (task) await store.put({ ...task, status: "wont-do", closedAt: new Date().toISOString() });
  await store.remove("bill", bill.id);
}

/** Total of bills still to pay before the end of this month. */
export function dueThisMonth(bills: BillStatus[], now: Date = new Date()): number {
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return bills
    .filter((b) => (b.state === "overdue" || b.state === "due-soon" || b.state === "upcoming") && b.nextDue && b.nextDue < end)
    .reduce((n, b) => n + b.bill.amountMinor, 0);
}
