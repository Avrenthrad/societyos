import { createBill, formatMoney, parseAmount, payBill, recordFromToday, stopBill, updateBill, type BillStatus } from "@societyos/finance-logic";
import { describeRRule, formatDay, localTz, parseQuickAdd } from "@societyos/today-logic";
import { font, radius, space } from "@societyos/ui";
import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { CURRENCY, OWNER, store } from "../store";
import type { Theme } from "../theme";
import { Button, Empty, Section, Segmented } from "./ui";

const REPEATS = [
  { value: "once", label: "Once", rrule: undefined },
  { value: "week", label: "Weekly", rrule: "FREQ=WEEKLY" },
  { value: "fortnight", label: "Fortnightly", rrule: "FREQ=WEEKLY;INTERVAL=2" },
  { value: "month", label: "Monthly", rrule: "FREQ=MONTHLY" },
  { value: "quarter", label: "Quarterly", rrule: "FREQ=MONTHLY;INTERVAL=3" },
  { value: "year", label: "Yearly", rrule: "FREQ=YEARLY" },
] as const;
type Repeat = (typeof REPEATS)[number]["value"];

export function stateLabel(b: BillStatus, now: Date): { text: string; tone: "warn" | "muted" | "ok" } {
  if (b.state === "paid") return { text: "Paid", tone: "ok" };
  if (b.state === "stopped") return { text: "Stopped", tone: "muted" };
  if (!b.nextDue) return { text: "No date", tone: "muted" };
  if (b.state === "overdue") return { text: `Overdue · was due ${formatDay(b.nextDue, now)}`, tone: "warn" };
  if (b.inDays === 0) return { text: "Due today", tone: "warn" };
  return { text: `Due ${formatDay(b.nextDue, now)}`, tone: b.state === "due-soon" ? "warn" : "muted" };
}

/** Bills, soonest first. Each one is a repeating task in Today. */
export function Bills({ t, bills, now }: { t: Theme; bills: BillStatus[]; now: Date }) {
  const { c } = t;
  const [openId, setOpenId] = useState<string>();
  const unrecorded = bills.filter((b) => b.unrecorded);
  return (
    <View style={{ gap: space.lg }}>
      {unrecorded.length ? (
        <Section t={t} title="Ticked off in Today">
          {unrecorded.map((b) => (
            <View key={b.bill.id} style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.sm, padding: space.md, borderRadius: radius.md, backgroundColor: t.f.warnSoft }}>
              <Text style={{ flex: 1, minWidth: 160, color: c.text, fontSize: 13 }}>
                {b.bill.name} was marked done {formatDay(b.unrecorded!, now).toLowerCase()}. Record the payment?
              </Text>
              <Button t={t} primary label={`Record ${formatMoney(b.bill.amountMinor, b.bill.currency)}`} onPress={() => recordFromToday(store, b, OWNER)} />
            </View>
          ))}
        </Section>
      ) : null}

      <Section t={t} title="Bills">
        {bills.length === 0 ? (
          <Empty t={t}>No bills yet. Add one below, or type “Rent 520 every month on the 1st” in the box. Each bill becomes a reminder task in Today.</Empty>
        ) : null}
        {bills.map((b) => (
          <BillRow key={b.bill.id} t={t} b={b} now={now} open={openId === b.bill.id} onToggle={() => setOpenId((x) => (x === b.bill.id ? undefined : b.bill.id))} />
        ))}
      </Section>

      <AddBill t={t} now={now} />
    </View>
  );
}

function BillRow({ t, b, now, open, onToggle }: { t: Theme; b: BillStatus; now: Date; open: boolean; onToggle: () => void }) {
  const { c, f } = t;
  const label = stateLabel(b, now);
  const [amount, setAmount] = useState((b.bill.amountMinor / 100).toFixed(2));
  const repeat = b.task?.recurrence ? describeRRule(b.task.recurrence.rrule) : "Once";
  const canPay = b.state !== "paid" && b.state !== "stopped";
  return (
    <View style={{ borderRadius: radius.md, borderWidth: open ? 2 : 1, borderColor: open ? f.accent : label.tone === "warn" ? f.warn : c.border, backgroundColor: c.bg }}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={onToggle} style={{ flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 56, padding: space.md }}>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text numberOfLines={1} style={{ color: c.text, fontSize: font.size.sm, fontWeight: "600" }}>{b.bill.name}</Text>
          <Text style={{ color: label.tone === "warn" ? f.warn : c.textMuted, fontSize: font.size.xs, fontWeight: label.tone === "warn" ? "600" : "400" }}>
            {label.text} · {repeat}{b.bill.autopay ? " · Autopay" : ""}
          </Text>
        </View>
        <Text style={{ color: c.text, fontSize: font.size.sm, fontWeight: "600", fontVariant: ["tabular-nums"] }}>{formatMoney(b.bill.amountMinor, b.bill.currency)}</Text>
        {canPay ? <Button t={t} primary label="Pay" a11y={`Mark ${b.bill.name} paid`} onPress={() => payBill(store, b.bill, OWNER)} /> : null}
      </Pressable>
      {open ? (
        <View style={{ gap: space.md, padding: space.md, paddingTop: 0 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
            <Text style={{ width: 70, color: c.textMuted, fontSize: 13 }}>Amount</Text>
            <TextInput
              accessibilityLabel={`${b.bill.name} amount`}
              value={amount}
              onChangeText={setAmount}
              onBlur={() => {
                const v = parseAmount(amount);
                if (v !== undefined && Math.abs(v) !== b.bill.amountMinor) void updateBill(store, b.bill, { amountMinor: Math.abs(v) });
              }}
              inputMode="decimal"
              style={{ flex: 1, height: 40, paddingHorizontal: space.md, borderRadius: radius.sm, borderWidth: 1, borderColor: c.border, color: c.text, fontSize: font.size.sm }}
            />
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
            <Text style={{ width: 70, color: c.textMuted, fontSize: 13 }}>Autopay</Text>
            <Segmented t={t} label="Autopay" value={b.bill.autopay ? "yes" : "no"} onChange={(v) => updateBill(store, b.bill, { autopay: v === "yes" })} options={[{ value: "no", label: "I pay it" }, { value: "yes", label: "Comes out itself" }]} />
          </View>
          <Text style={{ color: c.textMuted, fontSize: font.size.xs }}>
            In Today as “{b.task?.title ?? "(task removed)"}”. Its due date is this bill's due date, so moving one moves the other.
          </Text>
          <View style={{ flexDirection: "row", gap: space.sm }}>
            <Button t={t} danger label="Stop this bill" onPress={() => stopBill(store, b.bill)} />
          </View>
        </View>
      ) : null}
    </View>
  );
}

function AddBill({ t, now }: { t: Theme; now: Date }) {
  const { c } = t;
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [repeat, setRepeat] = useState<Repeat>("month");
  const [when, setWhen] = useState("");
  const [msg, setMsg] = useState<string>();
  const due = when.trim() ? parseQuickAdd(when, { now }).date : undefined;

  const add = async () => {
    const v = parseAmount(amount);
    if (!name.trim() || v === undefined) return setMsg("Add a name and an amount.");
    if (!due) return setMsg("When is it next due? e.g. “1 Nov”, “Friday”, “tomorrow”.");
    const rrule = REPEATS.find((r) => r.value === repeat)!.rrule;
    const day = due.getDate();
    const monthly = rrule?.startsWith("FREQ=MONTHLY") ? `${rrule};BYMONTHDAY=${day}` : rrule;
    const { task } = await createBill(store, { name: name.trim(), amountMinor: Math.abs(v), currency: CURRENCY, dueAt: due, recurrence: monthly ? { rrule: monthly, tz: localTz() } : undefined }, OWNER);
    setName("");
    setAmount("");
    setWhen("");
    setMsg(`Added. “${task.title}” is in Today for ${formatDay(due, now).toLowerCase()}.`);
  };

  const input = { height: 40, paddingHorizontal: space.md, borderRadius: radius.sm, borderWidth: 1, borderColor: c.border, color: c.text, fontSize: font.size.sm } as const;
  return (
    <Section t={t} title="Add a bill">
      <View style={{ gap: space.sm, padding: space.md, borderRadius: radius.md, backgroundColor: c.surface }}>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
          <TextInput accessibilityLabel="Bill name" value={name} onChangeText={setName} placeholder="Name, e.g. Electricity" placeholderTextColor={c.textMuted} style={[input, { flexGrow: 2, flexBasis: 160, backgroundColor: c.bg }]} />
          <TextInput accessibilityLabel="Bill amount" value={amount} onChangeText={setAmount} placeholder="Amount" inputMode="decimal" placeholderTextColor={c.textMuted} style={[input, { flexGrow: 1, flexBasis: 90, backgroundColor: c.bg }]} />
          <TextInput accessibilityLabel="Next due" value={when} onChangeText={setWhen} placeholder="Next due, e.g. 1 Nov" placeholderTextColor={c.textMuted} style={[input, { flexGrow: 1, flexBasis: 140, backgroundColor: c.bg }]} />
        </View>
        {due ? <Text style={{ color: c.textMuted, fontSize: font.size.xs }}>Next due {formatDay(due, now)}</Text> : null}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {REPEATS.map((r) => (
            <Pressable
              key={r.value}
              accessibilityRole="radio"
              accessibilityState={{ selected: repeat === r.value }}
              onPress={() => setRepeat(r.value)}
              style={{ minHeight: 32, paddingHorizontal: space.md, borderRadius: radius.pill, borderWidth: 1, borderColor: repeat === r.value ? t.f.accent : c.border, backgroundColor: repeat === r.value ? t.f.accentSoft : c.bg, justifyContent: "center" }}
            >
              <Text style={{ color: repeat === r.value ? t.f.accentText : c.text, fontSize: font.size.xs, fontWeight: repeat === r.value ? "600" : "400" }}>{r.label}</Text>
            </Pressable>
          ))}
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.md, flexWrap: "wrap" }}>
          <Button t={t} primary label="Add bill" onPress={add} />
          {msg ? <Text accessibilityLiveRegion="polite" style={{ flex: 1, minWidth: 160, color: c.textMuted, fontSize: font.size.xs }}>{msg}</Text> : null}
        </View>
      </View>
    </Section>
  );
}
