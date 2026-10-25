import type { Detected } from "@societyos/mail-logic";
import { space } from "@societyos/ui";
import { createElement, useState } from "react";
import { Platform, Text, View } from "react-native";
import type { Theme } from "../theme";
import { Button } from "./ui";

/**
 * An email body. Plain text shows dates as tappable "add to Today" links.
 * HTML (web) shows in a locked-down frame: no scripts, and remote images off
 * until asked for, so senders can't track when it was opened.
 */
export function MessageBody({ t, text, html, dates, onDate }: {
  t: Theme;
  text: string;
  html?: string;
  dates: Detected[];
  onDate: (d: Detected) => void;
}) {
  const [images, setImages] = useState(false);
  const [asText, setAsText] = useState(false);
  const { c } = t;

  if (html && Platform.OS === "web" && !asText) {
    const hasRemote = /<img[^>]+src=["']?https?:/i.test(html);
    const csp = `default-src 'none'; style-src 'unsafe-inline'; img-src data: cid:${images ? " https: http:" : ""}; font-src data:`;
    const doc = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><base target="_blank"><style>body{margin:0;font:14px/1.5 -apple-system,system-ui,sans-serif;color:${c.text};background:${c.bg};overflow-wrap:anywhere}img{max-width:100%;height:auto}a{color:${t.accent}}</style></head><body>${html}</body></html>`;
    return (
      <View style={{ gap: space.sm }}>
        {hasRemote && !images ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.sm, padding: space.sm, borderRadius: 6, backgroundColor: c.surface }}>
            <Text style={{ flex: 1, color: c.textMuted, fontSize: 12 }}>Images are hidden so the sender can't see when you open this.</Text>
            <Button t={t} small label="Show images" onPress={() => setImages(true)} />
          </View>
        ) : null}
        {createElement("iframe", {
          title: "Email",
          sandbox: "allow-popups allow-popups-to-escape-sandbox",
          srcDoc: doc,
          style: { width: "100%", minHeight: 360, height: 480, border: "none", borderRadius: 6, background: c.bg },
          onLoad: (e: { currentTarget: HTMLIFrameElement }) => {
            // Sandboxed without same-origin, so we can't measure it: make it tall enough for most mail.
            e.currentTarget.style.height = `${Math.min(1600, Math.max(360, text.length * 0.6))}px`;
          },
        })}
        <Button t={t} small kind="plain" label="Show as plain text" onPress={() => setAsText(true)} style={{ alignSelf: "flex-start" }} />
      </View>
    );
  }

  // Plain text, with detected dates as links.
  const parts: React.ReactNode[] = [];
  let at = 0;
  dates.forEach((d, i) => {
    if (d.start < at) return;
    parts.push(text.slice(at, d.start));
    parts.push(
      <Text
        key={i}
        accessibilityRole="link"
        accessibilityHint="Adds this to Today"
        onPress={() => onDate(d)}
        style={{ color: t.suggest.text, backgroundColor: t.suggest.bg, textDecorationLine: "underline" }}
      >
        {text.slice(d.start, d.end)}
      </Text>,
    );
    at = d.end;
  });
  parts.push(text.slice(at));
  return <Text selectable style={{ color: c.text, fontSize: 14, lineHeight: 21 }}>{parts}</Text>;
}
