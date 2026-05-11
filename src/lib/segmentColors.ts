/**
 * Shared segment color utility — reads `color` from a crm_lead_segments
 * row when present, otherwise falls back to a stable palette indexed by
 * sort_order. Used by both PipelineKanban (desktop) and MobilePipelineView
 * so the two surfaces stay in sync when admins recolor a pipeline.
 *
 * Each entry returns a triplet `{ bg, border, dot }` of HSL color strings
 * suitable for inline `style={{ background, borderColor, color }}` use.
 */

export interface SegmentColor {
  bg: string;
  border: string;
  dot: string;
}

/** Stable fallback palette — mirrors the legacy SEGMENT_COLORS rotation. */
const FALLBACK_PALETTE: SegmentColor[] = [
  { bg: 'hsl(var(--primary) / 0.06)',  border: 'hsl(var(--primary) / 0.3)',  dot: 'hsl(var(--primary))' },
  { bg: 'hsl(210 62% 46% / 0.06)', border: 'hsl(210 62% 46% / 0.3)', dot: 'hsl(210 62% 46%)' },
  { bg: 'hsl(0 84% 60% / 0.06)',   border: 'hsl(0 84% 60% / 0.3)',   dot: 'hsl(0 84% 60%)' },
  { bg: 'hsl(25 90% 55% / 0.06)',  border: 'hsl(25 90% 55% / 0.3)',  dot: 'hsl(25 90% 55%)' },
  { bg: 'hsl(220 50% 50% / 0.06)', border: 'hsl(220 50% 50% / 0.3)', dot: 'hsl(220 50% 50%)' },
  { bg: 'hsl(142 71% 45% / 0.06)', border: 'hsl(142 71% 45% / 0.3)', dot: 'hsl(142 71% 45%)' },
  { bg: 'hsl(270 60% 55% / 0.06)', border: 'hsl(270 60% 55% / 0.3)', dot: 'hsl(270 60% 55%)' },
  { bg: 'hsl(38 92% 50% / 0.06)',  border: 'hsl(38 92% 50% / 0.3)',  dot: 'hsl(38 92% 50%)' },
  { bg: 'hsl(142 71% 30% / 0.10)', border: 'hsl(142 71% 30% / 0.3)', dot: 'hsl(142 71% 30%)' },
  { bg: 'hsl(220 10% 50% / 0.06)', border: 'hsl(220 10% 50% / 0.3)', dot: 'hsl(220 10% 50%)' },
];

const DEFAULT_COLOR: SegmentColor = FALLBACK_PALETTE[FALLBACK_PALETTE.length - 1];

interface SegmentLike {
  name?: string | null;
  color?: string | null;     // hex (#RRGGBB) or hsl string
  sort_order?: number | null;
}

/** Convert a #RRGGBB hex string to an `H S% L%` HSL triplet (without `hsl()`). */
function hexToHslTriplet(hex: string): string | null {
  const m = hex.replace('#', '').trim();
  if (!/^[0-9a-fA-F]{6}$/.test(m)) return null;
  const r = parseInt(m.slice(0, 2), 16) / 255;
  const g = parseInt(m.slice(2, 4), 16) / 255;
  const b = parseInt(m.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)); break;
      case g: h = ((b - r) / d + 2); break;
      case b: h = ((r - g) / d + 4); break;
    }
    h /= 6;
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

/**
 * Resolve a segment to its visual color triplet.
 *  1. If `segment.color` is present (hex or `H S% L%`) — use it.
 *  2. Else fall back to `FALLBACK_PALETTE[sort_order % palette.length]`.
 *  3. Final fallback = neutral grey.
 */
export function getSegmentColor(segment: SegmentLike | null | undefined): SegmentColor {
  if (!segment) return DEFAULT_COLOR;

  // 1. Explicit color from DB (admin-set)
  const raw = (segment.color ?? '').trim();
  if (raw) {
    let triplet: string | null = null;
    if (raw.startsWith('#')) triplet = hexToHslTriplet(raw);
    else if (/^\d/.test(raw)) triplet = raw; // already an "H S% L%" form
    if (triplet) {
      return {
        bg: `hsl(${triplet} / 0.08)`,
        border: `hsl(${triplet} / 0.3)`,
        dot: `hsl(${triplet})`,
      };
    }
  }

  // 2. Indexed fallback by sort order
  const idx = typeof segment.sort_order === 'number'
    ? Math.abs(segment.sort_order) % FALLBACK_PALETTE.length
    : -1;
  if (idx >= 0) return FALLBACK_PALETTE[idx];

  return DEFAULT_COLOR;
}
