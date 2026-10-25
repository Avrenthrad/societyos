/**
 * Design tokens shared by every SocietyOS app, so the whole suite looks and
 * feels like one product. Components built on these live alongside them as
 * the first apps need them.
 */
export const colors = {
  light: {
    bg: "#FFFFFF",
    surface: "#F5F6F8",
    text: "#14161A",
    textMuted: "#5E6470",
    border: "#E2E5EA",
    accent: "#3D5AFE",
    danger: "#D93025",
    success: "#188038",
  },
  dark: {
    bg: "#0F1115",
    surface: "#191C22",
    text: "#ECEEF2",
    textMuted: "#9AA1AD",
    border: "#2A2F38",
    accent: "#7C8CFF",
    danger: "#F28B82",
    success: "#81C995",
  },
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 6, md: 10, lg: 16, pill: 999 } as const;
export const font = {
  size: { xs: 12, sm: 14, md: 16, lg: 20, xl: 28 },
  weight: { regular: "400", medium: "500", bold: "700" },
} as const;

/** Each app gets an accent so people can tell them apart at a glance. */
export const appAccents = {
  notes: "#F4B400",
  today: "#188038",
  inbox: "#3D5AFE",
  tasks: "#188038",
  calendar: "#D93025",
  people: "#8E24AA",
  money: "#00897B",
  finance: "#00897B",
  places: "#EF6C00",
  files: "#546E7A",
} as const;

/**
 * Timeline blocks. Tasks and events differ in fill lightness and shape
 * (tasks carry a checkbox), not only hue, so they stay apart for
 * colour-blind people too.
 */
export const blocks = {
  light: {
    task: { bg: "#DDF1E3", border: "#188038", text: "#0D4F22" },
    event: { bg: "#E8ECFF", border: "#3D5AFE", text: "#1F2E8C" },
    now: "#D93025",
  },
  dark: {
    task: { bg: "#143A22", border: "#81C995", text: "#D3F2DC" },
    event: { bg: "#1E2552", border: "#7C8CFF", text: "#E0E4FF" },
    now: "#F28B82",
  },
} as const;

export type ThemeName = keyof typeof colors;
