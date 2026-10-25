import type { Transaction } from "@societyos/core";
import { detectLayout, formatMoney, parseCsv, previewImport, saveImport, type ColumnMap, type CsvLayout, type DateOrder } from "@societyos/finance-logic";
import { formatDay } from "@societyos/today-logic";
import { font, radius, space } from "@societyos/ui";
import { useMemo, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { pickFile } from "../files";
import { CURRENCY, OWNER, store } from "../store";
import type { Theme } from "../theme";
import { Button, Chip, Section, Segmented } from "./ui";

/**
 * Bank CSV import: pick or paste a file, check the guessed columns, see
 * exactly what will be added (and what's already in), then import.
 */
export function ImportCsv({ t, existing, now, onDone }: { t: Theme; existing: Transaction[]; now: Date; onDone: (count: number) => void }) {
  const { c } = t;
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState<string>();
  const [account, setAccount] = useState("");
  const [override, setOverride] = useState<Partial<CsvLayout> & { columns?: ColumnMap }>({});
  const rows = useMemo(() => (text.trim() ? parseCsv(text) : []), [text]);
  const guessed = useMemo(() => (rows.length ? detectLayout(rows) : undefined), [rows]);
  const layout = guessed && { ...guessed, ...override, columns: override.columns ?? guessed.columns };
  const preview = useMemo(() => (layout ? previewImport(rows, layout, existing) : undefined), [rows, layout?.columns, layout?.dateOrder, layout?.hasHeader, existing]);
  const fresh = preview?.rows.filter((r) => !r.duplicate) ?? [];
  const width = Math.max(0, ...rows.slice(0, 5).map((r) => r.length));
  const colName = (i: number) => (layout?.hasHeader ? rows[0]?.[i] || `Column ${i + 1}` : `Column ${i + 1}${rows[0]?.[i] ? ` (${rows[0][i]!.slice(0, 14)})` : ""}`);

  const choose = async () => {
    const f = await pickFile(".csv,text/csv,text/plain");
    if (!f) return;
    setFileName(f.name);
    setOverride({});
    setText(await f.text());
    if (!account) setAccount(f.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").slice(0, 40));
  };
  const setCol = (role: keyof ColumnMap, i: number | undefined) => {
    if (!layout) return;
    const next = { ...layout.columns, [role]: i };
    if (role === "amount") {
      next.debit = undefined;
      next.credit = undefined;
    }
    if (role === "debit" || role === "credit") next.amount = undefined;
    setOverride((o) => ({ ...o, columns: next }));
  };
  const run = async () => {
    if (!fresh.length) return;
    const saved = await saveImport(store, fresh, { ...OWNER, account: account.trim() || undefined, currency: CURRENCY });
    setText("");
    setFileName(undefined);
    setOverride({});
    onDone(saved.length);
  };

  const twoCols = layout?.columns.amount === undefined;
  const roleRow = (label: string, role: keyof ColumnMap, optional = false) => (
    <View style={{ gap: 6 }}>
      <Text style={{ color: c.textMuted, fontSize: font.size.xs, fontWeight: "600" }}>{label}</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        {optional ? <Chip t={t} label="None" on={layout?.columns[role] === undefined} onPress={() => setCol(role, undefined)} /> : null}
        {Array.from({ length: width }, (_, i) => (
          <Chip key={i} t={t} label={colName(i)} on={layout?.columns[role] === i} onPress={() => setCol(role, i)} />
        ))}
      </View>
    </View>
  );

  return (
    <View style={{ gap: space.lg }}>
      <Text style={{ color: c.textMuted, fontSize: 13, lineHeight: 19 }}>
        Download a CSV from your bank's website or app (most call it “Export” or “Download transactions”), then pick it here. Importing the same months again won't add anything twice.
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm, alignItems: "center" }}>
        <Button t={t} primary label={fileName ? "Pick another file" : "Pick a CSV file"} onPress={choose} />
        {fileName ? <Text style={{ color: c.text, fontSize: 13 }}>{fileName}</Text> : null}
      </View>
      <TextInput
        accessibilityLabel="Or paste CSV text"
        value={text}
        onChangeText={(v) => {
          setText(v);
          setOverride({});
        }}
        multiline
        placeholder={"Or paste it here, e.g.\n25/10/2026,-4.50,BEAN CO SYDNEY"}
        placeholderTextColor={c.textMuted}
        style={{ minHeight: 90, maxHeight: 160, padding: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, color: c.text, fontSize: 12, fontFamily: "monospace", textAlignVertical: "top" }}
      />

      {layout && preview ? (
        <>
          <Section t={t} title="Columns">
            <View style={{ gap: space.md }}>
              <Segmented t={t} label="First row" value={layout.hasHeader ? "header" : "data"} onChange={(v) => setOverride((o) => ({ ...o, hasHeader: v === "header" }))} options={[{ value: "header", label: "First row is titles" }, { value: "data", label: "First row is data" }]} />
              {roleRow("Date", "date")}
              <Segmented t={t} label="Amount columns" value={twoCols ? "two" : "one"} onChange={(v) => (v === "one" ? setCol("amount", layout.columns.debit ?? 1) : setOverride((o) => ({ ...o, columns: { ...layout.columns, amount: undefined, debit: layout.columns.amount ?? 1, credit: (layout.columns.amount ?? 1) + 1 } })))} options={[{ value: "one", label: "One amount column" }, { value: "two", label: "Money out + money in" }]} />
              {twoCols ? (
                <>
                  {roleRow("Money out", "debit")}
                  {roleRow("Money in", "credit")}
                </>
              ) : (
                roleRow("Amount", "amount")
              )}
              {roleRow("Description", "description")}
              <View style={{ gap: 6 }}>
                <Text style={{ color: c.textMuted, fontSize: font.size.xs, fontWeight: "600" }}>Dates are written</Text>
                <Segmented<DateOrder> t={t} label="Date order" value={layout.dateOrder} onChange={(v) => setOverride((o) => ({ ...o, dateOrder: v }))} options={[{ value: "dmy", label: "Day first" }, { value: "mdy", label: "Month first" }, { value: "ymd", label: "Year first" }]} />
              </View>
              <View style={{ gap: 6 }}>
                <Text style={{ color: c.textMuted, fontSize: font.size.xs, fontWeight: "600" }}>Account name (optional)</Text>
                <TextInput accessibilityLabel="Account name" value={account} onChangeText={setAccount} placeholder="e.g. Everyday" placeholderTextColor={c.textMuted} style={{ height: 40, paddingHorizontal: space.md, borderRadius: radius.sm, borderWidth: 1, borderColor: c.border, color: c.text, fontSize: font.size.sm }} />
              </View>
            </View>
          </Section>

          <Section t={t} title={`Preview · ${fresh.length} new${preview.rows.length - fresh.length ? `, ${preview.rows.length - fresh.length} already in` : ""}${preview.skipped.length ? `, ${preview.skipped.length} unreadable` : ""}`}>
            <View style={{ borderRadius: radius.md, borderWidth: 1, borderColor: c.border, overflow: "hidden" }}>
              {preview.rows.slice(0, 12).map((r) => (
                <View key={r.line} style={{ flexDirection: "row", gap: space.md, alignItems: "center", paddingHorizontal: space.md, minHeight: 38, borderBottomWidth: 1, borderColor: c.border, opacity: r.duplicate ? 0.5 : 1 }}>
                  <Text style={{ width: 84, color: c.textMuted, fontSize: 12 }}>{formatDay(r.occurredAt, now)}</Text>
                  <Text numberOfLines={1} style={{ flex: 1, color: c.text, fontSize: 12 }}>{r.duplicate ? `Already in · ${r.description}` : r.description}</Text>
                  <Text style={{ color: r.amountMinor > 0 ? t.f.money.in : c.text, fontSize: 12, fontWeight: "600", fontVariant: ["tabular-nums"] }}>{formatMoney(r.amountMinor, CURRENCY, { signed: true })}</Text>
                </View>
              ))}
              {preview.rows.length > 12 ? <Text style={{ padding: space.md, color: c.textMuted, fontSize: 12 }}>…and {preview.rows.length - 12} more</Text> : null}
              {preview.rows.length === 0 ? <Text style={{ padding: space.md, color: c.textMuted, fontSize: 12 }}>No rows could be read with these columns. Try changing them above.</Text> : null}
            </View>
            {preview.skipped.length ? (
              <Text style={{ color: c.textMuted, fontSize: font.size.xs }}>
                Skipped line {preview.skipped.slice(0, 5).map((s) => `${s.line} (${s.reason})`).join(", ")}
                {preview.skipped.length > 5 ? "…" : ""}
              </Text>
            ) : null}
          </Section>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: !fresh.length }}
            onPress={run}
            style={{ minHeight: 48, borderRadius: radius.md, backgroundColor: fresh.length ? t.f.accent : c.border, alignItems: "center", justifyContent: "center" }}
          >
            <Text style={{ color: "#FFFFFF", fontWeight: "700", fontSize: font.size.sm }}>{fresh.length ? `Import ${fresh.length} transaction${fresh.length === 1 ? "" : "s"}` : "Nothing new to import"}</Text>
          </Pressable>
        </>
      ) : null}
    </View>
  );
}
