import { importContacts, parseVCards, type ContactCard, type ImportResult } from "@societyos/people-logic";
import { font, space } from "@societyos/ui";
import { useState } from "react";
import { Platform, Text, View } from "react-native";
import { base, store } from "../store";
import type { Theme } from "../theme";
import { Button } from "./Bits";

type ContactsApi = { select(props: string[], opts: { multiple: boolean }): Promise<{ name?: string[]; email?: string[]; tel?: string[] }[]> };

/** Android Chrome can hand over picked phone contacts directly (no birthdays, though). */
function contactPicker(): ContactsApi | undefined {
  if (Platform.OS !== "web") return undefined;
  return (globalThis.navigator as { contacts?: ContactsApi } | undefined)?.contacts;
}

/** Ask the browser for a .vcf file and read it as text. */
function pickVcf(): Promise<string | undefined> {
  return new Promise((resolve) => {
    const doc = (globalThis as { document?: Document }).document;
    if (!doc) return resolve(undefined);
    const input = doc.createElement("input");
    input.type = "file";
    input.accept = ".vcf,text/vcard,text/x-vcard";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return resolve(undefined);
      file.text().then(resolve, () => resolve(undefined));
    };
    input.click();
  });
}

function summary(r: ImportResult) {
  const parts = [`${r.added} added`];
  if (r.updated) parts.push(`${r.updated} updated`);
  if (r.unchanged) parts.push(`${r.unchanged} already here`);
  return parts.join(", ");
}

/**
 * Bring people in without typing them: a contacts file exported from a
 * phone, Google or Outlook, or (Android) the phone's own contact picker.
 * Read on this device only; existing people are merged, not duplicated.
 */
export function Import({ t, compact }: { t: Theme; compact?: boolean }) {
  const [msg, setMsg] = useState<string>();
  if (Platform.OS !== "web") return null;
  const picker = contactPicker();

  const run = async (cards: ContactCard[] | undefined) => {
    if (!cards) return;
    if (!cards.length) return setMsg("No contacts found in that file.");
    setMsg(`Imported: ${summary(await importContacts(store, cards, base))}.`);
  };

  return (
    <View style={{ gap: space.xs }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
        <Button t={t} small={compact} label="Import contacts file" a11y="Import a contacts file (.vcf)" onPress={async () => {
          const text = await pickVcf();
          await run(text == null ? undefined : parseVCards(text));
        }} />
        {picker ? (
          <Button t={t} small={compact} label="Pick from phone" onPress={async () => {
            try {
              const picked = await picker.select(["name", "email", "tel"], { multiple: true });
              await run(picked.map((p) => ({ name: p.name?.[0] ?? p.email?.[0] ?? p.tel?.[0] ?? "", emails: p.email ?? [], phones: p.tel ?? [] })).filter((x) => x.name));
            } catch {
              setMsg("Couldn't open your contacts.");
            }
          }} />
        ) : null}
      </View>
      {msg ? <Text accessibilityLiveRegion="polite" style={{ color: t.c.textMuted, fontSize: font.size.xs }}>{msg}</Text> : null}
    </View>
  );
}
