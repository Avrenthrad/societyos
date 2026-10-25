import type { Task } from "@societyos/core";
import { addMinutes, completeTask, formatRange, moveBlock, resizeBlock, sameDay, type TimelineItem } from "@societyos/today-logic";
import { font, radius, space } from "@societyos/ui";
import { useEffect, useRef, useState } from "react";
import { PanResponder, Pressable, ScrollView, Text, View } from "react-native";
import { store } from "../store";
import type { Theme } from "../theme";
import { Checkbox } from "./Checkbox";

const GUTTER = 56;
const SNAP_MIN = 15;

export interface TimelineProps {
  t: Theme;
  day: Date;
  now: Date;
  items: TimelineItem[];
  hourHeight?: number;
  startHour?: number;
  endHour?: number;
  selectedId?: string;
  /** A task waiting for a time: empty slots become tappable. */
  placing?: Task;
  onSelect: (item: TimelineItem) => void;
  onPlace: (start: Date) => void;
}

/**
 * The day, hour by hour. Task blocks and events share it; a task block is
 * the task itself, so dragging it reschedules the task.
 */
export function Timeline({ t, day, now, items, hourHeight = 56, startHour = 6, endHour = 22, selectedId, placing, onSelect, onPlace }: TimelineProps) {
  const { c, b } = t;
  const [width, setWidth] = useState(0);
  const scroll = useRef<ScrollView>(null);
  const H = hourHeight;
  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i);
  const y = (d: Date) => ((d.getHours() - startHour) * 60 + d.getMinutes()) * (H / 60);
  const at = (h: number, m: number) => new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m);
  const isToday = sameDay(day, now);

  useEffect(() => {
    const target = isToday ? Math.max(0, y(now) - 2 * H) : (8 - startHour) * H;
    const id = setTimeout(() => scroll.current?.scrollTo({ y: target, animated: false }), 0);
    return () => clearTimeout(id);
  }, [day.getTime()]);

  const laneW = (lanes: number) => Math.max(0, (width - GUTTER - 4) / lanes);

  return (
    <ScrollView ref={scroll} style={{ flex: 1 }} contentContainerStyle={{ paddingVertical: space.sm }}>
      <View
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        style={{ height: hours.length * H, position: "relative" }}
        accessibilityLabel="Day timeline"
      >
        {hours.map((h, i) => (
          <View key={h} style={{ position: "absolute", left: 0, right: 0, top: i * H, height: H, borderTopWidth: 1, borderColor: c.border }}>
            <Text style={{ position: "absolute", left: 0, top: -8, width: GUTTER - 8, color: c.textMuted, fontSize: 11, backgroundColor: c.bg }}>
              {`${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? "am" : "pm"}`}
            </Text>
          </View>
        ))}

        {placing
          ? hours.flatMap((h, i) =>
              [0, 30].map((m) => (
                <Pressable
                  key={`${h}:${m}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Place ${placing.title} at ${h}:${m === 0 ? "00" : "30"}`}
                  onPress={() => onPlace(at(h, m))}
                  style={(state) => ({
                    position: "absolute",
                    left: GUTTER,
                    right: 0,
                    top: i * H + (m / 60) * H,
                    height: H / 2,
                    backgroundColor: (state as { hovered?: boolean }).hovered || state.pressed ? b.task.bg : "transparent",
                    borderRadius: radius.sm,
                  })}
                />
              )),
            )
          : null}

        {items.map((item) => (
          <Block
            key={item.id}
            t={t}
            item={item}
            top={y(item.start)}
            height={Math.max(20, ((+item.end - +item.start) / 60_000) * (H / 60) - 2)}
            left={GUTTER + item.lane * laneW(item.lanes)}
            width={laneW(item.lanes) - 4}
            hourHeight={H}
            selected={item.id === selectedId}
            onSelect={() => onSelect(item)}
          />
        ))}

        {isToday && now.getHours() >= startHour && now.getHours() < endHour ? (
          <View pointerEvents="none" style={{ position: "absolute", left: GUTTER - 6, right: 0, top: y(now) - 1, height: 2, backgroundColor: b.now }}>
            <View style={{ position: "absolute", left: 0, top: -4, width: 10, height: 10, borderRadius: 5, backgroundColor: b.now }} />
          </View>
        ) : null}
      </View>
    </ScrollView>
  );
}

function Block({ t, item, top, height, left, width, hourHeight, selected, onSelect }: {
  t: Theme;
  item: TimelineItem;
  top: number;
  height: number;
  left: number;
  width: number;
  hourHeight: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const style = item.kind === "task" ? t.b.task : t.b.event;
  const [dy, setDy] = useState(0);
  const [dh, setDh] = useState(0);
  const latest = useRef({ item, hourHeight, selected });
  latest.current = { item, hourHeight, selected };
  const snap = (px: number) => Math.round((px / latest.current.hourHeight) * (60 / SNAP_MIN)) * SNAP_MIN;

  // Drag a selected task block to move it; drag its bottom edge to resize.
  const mover = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => latest.current.item.kind === "task" && latest.current.selected && Math.abs(g.dy) > 4,
      onPanResponderTerminationRequest: () => false,
      onPanResponderMove: (_, g) => setDy(g.dy),
      onPanResponderRelease: (_, g) => {
        setDy(0);
        const { item } = latest.current;
        const mins = snap(g.dy);
        if (item.kind === "task" && mins) moveBlock(store, item.task, addMinutes(item.start, mins));
      },
      onPanResponderTerminate: () => setDy(0),
    }),
  ).current;
  const resizer = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderMove: (_, g) => setDh(g.dy),
      onPanResponderRelease: (_, g) => {
        setDh(0);
        const { item } = latest.current;
        const mins = snap(g.dy);
        if (item.kind === "task" && mins) resizeBlock(store, item.task, addMinutes(item.end, mins));
      },
      onPanResponderTerminate: () => setDh(0),
    }),
  ).current;

  const short = height < 40;
  const meta = [formatRange(item.start, item.end), item.kind === "event" ? item.event.location : item.task.projectId].filter(Boolean).join(" · ");

  return (
    <View
      {...mover.panHandlers}
      style={{ position: "absolute", top: top + dy, left, width: Math.max(0, width), height: Math.max(20, height + dh), zIndex: selected || dy || dh ? 2 : 1 }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected }}
        accessibilityLabel={`${item.kind === "task" ? "Task" : "Event"}: ${item.title}, ${meta}`}
        onPress={onSelect}
        style={{
          flex: 1,
          flexDirection: "row",
          alignItems: "flex-start",
          gap: space.sm,
          paddingHorizontal: space.sm,
          paddingVertical: short ? 2 : 6,
          borderRadius: radius.sm + 2,
          borderWidth: selected ? 2 : 1,
          borderColor: selected ? style.text : style.border,
          backgroundColor: style.bg,
          overflow: "hidden",
          opacity: item.kind === "task" && item.task.status === "done" ? 0.6 : 1,
        }}
      >
        {item.kind === "task" ? (
          <Checkbox size={16} checked={item.task.status === "done"} color={style.border} label={`Done: ${item.title}`} onToggle={() => completeTask(store, item.task)} />
        ) : null}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ color: style.text, fontSize: 13, fontWeight: "600", textDecorationLine: item.kind === "task" && item.task.status === "done" ? "line-through" : "none" }}>
            {item.title}
          </Text>
          {short ? null : <Text numberOfLines={1} style={{ color: style.text, fontSize: font.size.xs }}>{meta}</Text>}
        </View>
      </Pressable>
      {item.kind === "task" && selected ? (
        <View
          {...resizer.panHandlers}
          accessibilityLabel="Drag to change length"
          style={{ position: "absolute", left: 0, right: 0, bottom: -6, height: 12, alignItems: "center", justifyContent: "center" }}
        >
          <View style={{ width: 28, height: 4, borderRadius: 2, backgroundColor: style.text }} />
        </View>
      ) : null}
    </View>
  );
}
