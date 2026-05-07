import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Pill — single canonical chip primitive for the CRM.
 *
 * Sizes are TIGHT and editorial by design. Never override font-size or
 * padding from the call site — pick a size variant instead. Color is the
 * only thing call sites should override, via `tone` (semantic) or `color`
 * (custom HSL string for dynamic segment / tag colors).
 *
 * Spec (matches Leads table tag pill):
 *   - sm: text-[10.5px] / px-2 / py-0.5
 *   - md: text-[11px]   / px-2.5 / py-0.5  (rare — dialogs/headers only)
 *
 * Always rounded-full, font-medium, leading-none, single-line.
 */

export type PillTone =
  | 'neutral'
  | 'primary'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'muted';

export type PillSize = 'sm' | 'md';

const TONE_CLASSES: Record<PillTone, string> = {
  neutral: 'bg-muted text-foreground/80',
  primary: 'bg-primary/15 text-primary',
  success: 'bg-success/15 text-success',
  warning: 'bg-warning/15 text-warning',
  danger:  'bg-destructive/15 text-destructive',
  info:    'bg-info/15 text-info',
  muted:   'bg-muted/60 text-muted-foreground',
};

const SIZE_CLASSES: Record<PillSize, string> = {
  sm: 'text-[10.5px] px-2 py-0.5',
  md: 'text-[11px] px-2.5 py-0.5',
};

const BASE =
  'inline-flex items-center gap-1 rounded-full font-medium leading-none whitespace-nowrap select-none transition-colors';

export interface PillProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Semantic tone. Ignored when `color` is provided. */
  tone?: PillTone;
  /** Custom HSL color string (e.g. "hsl(210 62% 46%)"). Wins over `tone`. */
  color?: string;
  size?: PillSize;
  /** Render as <button> when interactive. */
  asButton?: boolean;
  /** Show as truncating with maxWidth (chars approx). */
  truncate?: boolean;
}

export const Pill = React.forwardRef<HTMLSpanElement, PillProps>(
  ({ tone = 'neutral', color, size = 'sm', asButton, truncate, className, style, children, ...rest }, ref) => {
    const colorStyle = color
      ? { background: `${color}1A`, color, ...style }
      : style;

    const cls = cn(
      BASE,
      SIZE_CLASSES[size],
      !color && TONE_CLASSES[tone],
      truncate && 'max-w-[140px] overflow-hidden',
      className,
    );

    if (asButton) {
      return (
        <button
          type="button"
          ref={ref as React.Ref<any>}
          className={cn(cls, 'cursor-pointer hover:opacity-90 focus:outline-none focus:ring-1 focus:ring-primary/40')}
          style={colorStyle}
          {...(rest as any)}
        >
          {truncate ? <span className="block truncate">{children}</span> : children}
        </button>
      );
    }

    return (
      <span ref={ref} className={cls} style={colorStyle} {...rest}>
        {truncate ? <span className="block truncate">{children}</span> : children}
      </span>
    );
  },
);
Pill.displayName = 'Pill';
