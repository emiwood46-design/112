import type { ItemColor } from "./types";

/** Именованная палитра, к которой приводится авто-определённый цвет. */
export const PALETTE: ItemColor[] = [
  { name: "чёрный", hex: "#1f1f1f" },
  { name: "белый", hex: "#f7f7f5" },
  { name: "серый", hex: "#8e8e8e" },
  { name: "бежевый", hex: "#d9c4a3" },
  { name: "коричневый", hex: "#7a4f2e" },
  { name: "красный", hex: "#c62828" },
  { name: "бордовый", hex: "#6d1a2a" },
  { name: "розовый", hex: "#f2a7bd" },
  { name: "оранжевый", hex: "#ef7d22" },
  { name: "жёлтый", hex: "#f2d03b" },
  { name: "зелёный", hex: "#3f8f4a" },
  { name: "оливковый", hex: "#6b6b2f" },
  { name: "голубой", hex: "#8ec5ea" },
  { name: "синий", hex: "#2d5fbf" },
  { name: "тёмно-синий", hex: "#1d2a4d" },
  { name: "фиолетовый", hex: "#7b4fa8" },
];

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex(r: number, g: number, b: number): string {
  return "#" + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
}

function rgbToLab(r: number, g: number, b: number): [number, number, number] {
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const [R, G, B] = [lin(r), lin(g), lin(b)];
  const x = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
  const y = R * 0.2126 + G * 0.7152 + B * 0.0722;
  const z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const [fx, fy, fz] = [f(x), f(y), f(z)];
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** Ближайший цвет палитры (по расстоянию в пространстве Lab). */
export function nearestPaletteColor(hex: string): ItemColor {
  const lab = rgbToLab(...hexToRgb(hex));
  let best = PALETTE[0];
  let bestDist = Infinity;
  for (const c of PALETTE) {
    const l2 = rgbToLab(...hexToRgb(c.hex));
    const d = (lab[0] - l2[0]) ** 2 + (lab[1] - l2[1]) ** 2 + (lab[2] - l2[2]) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = c;
    }
  }
  return best;
}
