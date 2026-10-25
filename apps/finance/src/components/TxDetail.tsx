import type { CalendarEvent, FileRef, Person, Place, Transaction } from "@societyos/core";
import { CATEGORIES, findOrCreatePerson, findOrCreatePlace, formatMoney, parseAmount, setCategory, suggestEvents, unlink } from "@societyos/finance-logic";
import { link } from "@societyos/sync";
import { addDays, formatDay, formatTime, startOfDay } from "@societyos/today-logic";
import { font, radius, space } from "@societyos/ui";
import { useEffect, useMemo, useState } from "react";
import { Image, Pressable, Text, TextInput, View } from "react-native";
import { attachReceipt, canAttach, pickFile, receiptUrl, removeReceipt } from "../files";
import { CURRENCY, OWNER, store } from "../store";
import type { Theme } from "../theme";
import { useTxLinks } from "../useFinance";
import { Button, Chip, Section, Segmented } from "./ui";

/** One transaction: fix any detail, and join it to people, places, events and receipts. */
export function TxDetail({ t, tx, people, places, events, now, onClose }: {
  t: Theme;
  tx: Transaction;
  people: Person[];
  places: Place[];
  events: CalendarEvent[];
  now: Date;
  onClose?: () => void;
}) {
  const { c } = t;
  const links = useTxLinks(tx);
  const [desc, setDesc] = useState(tx.description);
  const [amount, setAmount] = useState(tx.amountMinor ? (Math.abs(tx.amountMinor) / 100).toFixed(2) : "");
  const [notes, setNotes] = useState(tx.notes ?? "");
  const [taught, setTaught] = useState<string>();
  useEffect(() => {
    setDesc(tx.description);
    setAmount(tx.amountMinor ? (Math.abs(tx.amountMinor) / 100).toFixed(2) : "");
    setNotes(tx.notes ?? "");
    setTaught(undefined);
  }, [tx.id]);

  const direction = tx.amountMinor > 0 ? "in" : "out";
  const save = (changes: Partial<Transaction>) => store.put({ ...tx, ...changes });
  const saveAmount = () => {
    const v = parseAmount(amount);
    if (v === undefined) return;
    void save({ amountMinor: direction === "in" ? Math.abs(v) : -Math.abs(v) });
  };
  const d = new Date(tx.occurredAt);
  const setDay = (day: Date) => save({ occurredAt: new Date(day.getFullYear(), day.getMonth(), day.getDate(), d.getHours(), d.getMinutes()).toISOString() });

  const linkedIds = new Set(links ? [...links.linkIds.keys()] : []);
  const eventIdeas = useMemo(() => suggestEvents(tx, events).filter((e) => !linkedIds.has(e.id)).slice(0, 3), [tx.occurredAt, events, links]);

  return (
    <View style={{ gap: space.lg }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: space.sm }}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={{ color: t.f.accent, fontSize: font.size.xs, fontWeight: "700" }}>{tx.billId ? "Bill payment" : direction === "in" ? "Money in" : "Spend"}</Text>
          <TextInput
            accessibilityLabel="Description"
            value={desc}
            onChangeText={setDesc}
            onBlur={() => desc.trim() && desc !== tx.description && save({ description: desc.trim() })}
            style={{ color: c.text, fontSize: 18, fontWeight: "700", padding: 0 }}
          />
        </View>
        {onClose ? <Button t={t} label="Close" onPress={onClose} /> : null}
      </View>

      <View style={{ gap: space.sm }}>
        <Segmented t={t} label="Money in or out" value={direction} onChange={(v) => save({ amountMinor: v === "in" ? Math.abs(tx.amountMinor) : -Math.abs(tx.amountMinor) })} options={[{ value: "out", label: "Money out" }, { value: "in", label: "Money in" }]} />
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
          <Text style={{ color: c.textMuted, fontSize: 22, fontWeight: "600" }}>$</Text>
          <TextInput
            accessibilityLabel="Amount"
            value={amount}
            onChangeText={setAmount}
            onBlur={saveAmount}
            onSubmitEditing={saveAmount}
            inputMode="decimal"
            keyboardType="decimal-pad"
            placeholder="0.00"
            placeholderTextColor={c.textMuted}
            style={{ flex: 1, minWidth: 0, height: 48, paddingHorizontal: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: tx.amountMinor === 0 ? t.f.warn : c.border, color: c.text, fontSize: 22, fontWeight: "600", fontVariant: ["tabular-nums"] }}
          />
        </View>
      </View>

      <Section t={t} title="When">
        <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.sm }}>
          <Text style={{ color: c.text, fontSize: font.size.sm, minWidth: 110 }}>
            {formatDay(d, now)}
            {d.getHours() || d.getMinutes() ? `, ${formatTime(d)}` : ""}
          </Text>
          <Button t={t} label="‹ Day" a11y="One day earlier" onPress={() => setDay(addDays(d, -1))} />
          <Button t={t} label="Day ›" a11y="One day later" onPress={() => setDay(addDays(d, 1))} />
          <Button t={t} label="Today" onPress={() => setDay(startOfDay(now))} />
        </View>
      </Section>

      <Section t={t} title="Category">
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {[...new Set([...CATEGORIES, ...(tx.category ? [tx.category] : [])])].map((cat) => (
            <Chip
              key={cat}
              t={t}
              label={cat}
              on={tx.category === cat}
              onPress={async () => {
                const next = tx.category === cat ? undefined : cat;
                const n = await setCategory(store, tx, next);
                setTaught(n ? `Also set ${n} other ${n === 1 ? "spend" : "spends"} from the same place.` : undefined);
              }}
            />
          ))}
        </View>
        {taught ? <Text style={{ color: c.textMuted, fontSize: font.size.xs }}>{taught}</Text> : null}
      </Section>

      <Picker
        t={t}
        title="People"
        linked={links?.people ?? []}
        options={people}
        placeholder="Add a person"
        onAdd={async (name, existing) => link(store, tx, existing ?? (await findOrCreatePerson(store, name, OWNER)), "related", OWNER)}
        onRemove={(p) => links && unlink(store, links, p.id)}
        hint="Shows on their timeline in People."
      />
      <Picker
        t={t}
        title="Place"
        linked={links?.places ?? []}
        options={places}
        placeholder="Add a place"
        onAdd={async (name, existing) => link(store, tx, existing ?? (await findOrCreatePlace(store, name, OWNER)), "located-at", OWNER)}
        onRemove={(p) => links && unlink(store, links, p.id)}
      />

      <Section t={t} title="Event">
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {(links?.events ?? []).map((e) => (
            <Chip key={e.id} t={t} on label={e.title} onRemove={() => links && unlink(store, links, e.id)} />
          ))}
          {eventIdeas.map((e) => (
            <Chip key={e.id} t={t} label={`+ ${e.title}`} a11y={`Link to ${e.title}`} onPress={() => link(store, tx, e, "related", OWNER)} />
          ))}
        </View>
        {!links?.events.length && !eventIdeas.length ? <Text style={{ color: c.textMuted, fontSize: font.size.xs }}>No events that day. Events from Today show here to link with one tap.</Text> : null}
      </Section>

      <Section t={t} title="Receipts">
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
          {(links?.receipts ?? []).map((r) => (
            <Receipt key={r.id} t={t} file={r} />
          ))}
          {canAttach() ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add a receipt photo"
              onPress={async () => {
                const file = await pickFile("image/*,application/pdf", true);
                if (file) await attachReceipt(tx, file);
              }}
              style={{ width: 96, height: 96, borderRadius: radius.md, borderWidth: 1, borderStyle: "dashed", borderColor: c.border, alignItems: "center", justifyContent: "center", gap: 4 }}
            >
              <Text style={{ fontSize: 22 }}>📷</Text>
              <Text style={{ color: c.textMuted, fontSize: font.size.xs }}>Add photo</Text>
            </Pressable>
          ) : (
            <Text style={{ color: c.textMuted, fontSize: font.size.xs }}>Receipts can be added in the web app for now.</Text>
          )}
        </View>
      </Section>

      <Section t={t} title="Notes">
        <TextInput
          accessibilityLabel="Notes"
          value={notes}
          onChangeText={setNotes}
          onBlur={() => notes !== (tx.notes ?? "") && save({ notes: notes || undefined })}
          multiline
          placeholder="Anything to remember"
          placeholderTextColor={c.textMuted}
          style={{ minHeight: 64, padding: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, color: c.text, fontSize: font.size.sm, textAlignVertical: "top" }}
        />
      </Section>

      <View style={{ gap: 4 }}>
        {tx.account ? <Text style={{ color: c.textMuted, fontSize: font.size.xs }}>Account: {tx.account}</Text> : null}
        {tx.importKey ? <Text style={{ color: c.textMuted, fontSize: font.size.xs }}>Imported from a bank CSV.</Text> : null}
      </View>
      <View style={{ flexDirection: "row" }}>
        <Button t={t} danger label="Delete" a11y={`Delete ${tx.description}, ${formatMoney(tx.amountMinor, CURRENCY)}`} onPress={async () => {
          await store.remove("transaction", tx.id);
          onClose?.();
        }} />
      </View>
    </View>
  );
}

function Picker<T extends { id: string; name: string }>({ t, title, linked, options, placeholder, onAdd, onRemove, hint }: {
  t: Theme;
  title: string;
  linked: T[];
  options: T[];
  placeholder: string;
  onAdd: (name: string, existing?: T) => Promise<unknown>;
  onRemove: (x: T) => void;
  hint?: string;
}) {
  const { c } = t;
  const [q, setQ] = useState("");
  const linkedIds = new Set(linked.map((x) => x.id));
  const s = q.trim().toLowerCase();
  const matches = s ? options.filter((o) => !linkedIds.has(o.id) && o.name.toLowerCase().includes(s)).slice(0, 4) : [];
  const exact = options.find((o) => o.name.toLowerCase() === s);
  const add = async (name: string, existing?: T) => {
    if (!name.trim()) return;
    await onAdd(name.trim(), existing);
    setQ("");
  };
  return (
    <Section t={t} title={title}>
      {linked.length ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {linked.map((x) => (
            <Chip key={x.id} t={t} on label={x.name} onRemove={() => onRemove(x)} />
          ))}
        </View>
      ) : null}
      <TextInput
        accessibilityLabel={placeholder}
        value={q}
        onChangeText={setQ}
        onSubmitEditing={() => add(q, exact)}
        placeholder={placeholder}
        placeholderTextColor={c.textMuted}
        returnKeyType="done"
        style={{ height: 40, paddingHorizontal: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, color: c.text, fontSize: font.size.sm }}
      />
      {s ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {matches.map((m) => (
            <Chip key={m.id} t={t} label={m.name} onPress={() => add(m.name, m)} />
          ))}
          {!exact ? <Chip t={t} label={`+ New: ${q.trim()}`} onPress={() => add(q)} /> : null}
        </View>
      ) : hint ? (
        <Text style={{ color: c.textMuted, fontSize: font.size.xs }}>{hint}</Text>
      ) : null}
    </Section>
  );
}

function Receipt({ t, file }: { t: Theme; file: FileRef }) {
  const { c } = t;
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    let live = true;
    receiptUrl(file).then((u) => live && setUrl(u));
    return () => {
      live = false;
    };
  }, [file.storageKey]);
  const isImage = file.mimeType.startsWith("image/");
  return (
    <View style={{ width: 96, gap: 4 }}>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`Open receipt ${file.name}`}
        onPress={() => url && globalThis.open?.(url, "_blank")}
        style={{ width: 96, height: 96, borderRadius: radius.md, overflow: "hidden", borderWidth: 1, borderColor: c.border, alignItems: "center", justifyContent: "center", backgroundColor: c.surface }}
      >
        {url && isImage ? (
          <Image source={{ uri: url }} accessibilityIgnoresInvertColors style={{ width: 96, height: 96 }} resizeMode="cover" />
        ) : (
          <Text style={{ color: c.textMuted, fontSize: font.size.xs, textAlign: "center", padding: 4 }}>{url ? "PDF" : "On another device"}</Text>
        )}
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={`Remove receipt ${file.name}`} onPress={() => removeReceipt(file)} style={{ minHeight: 28, justifyContent: "center" }}>
        <Text style={{ color: c.textMuted, fontSize: font.size.xs, textAlign: "center" }}>Remove</Text>
      </Pressable>
    </View>
  );
}
