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
  inbox: "#3D5AFE",
  tasks: "#188038",
  calendar: "#D93025",
  people: "#8E24AA",
  money: "#00897B",
  places: "#EF6C00",
  files: "#546E7A",
} as const;

export type ThemeName = keyof typeof colors;
