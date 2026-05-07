import { Badge } from '@/components/ui/badge';

const STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  'New Lead':        { bg: 'hsl(39 67% 55% / 0.15)', text: 'hsl(39 67% 55%)' },
  'Contacted':       { bg: 'hsl(210 62% 46% / 0.15)', text: 'hsl(210 62% 46%)' },
  'Nurturing':       { bg: 'hsl(38 92% 50% / 0.15)', text: 'hsl(38 92% 50%)' },
  'Hot / Engaged':   { bg: 'hsl(0 84% 60% / 0.15)', text: 'hsl(0 84% 60%)' },
  'Showing Booked':  { bg: 'hsl(142 71% 45% / 0.15)', text: 'hsl(142 71% 45%)' },
  'Offer Made':      { bg: 'hsl(270 60% 55% / 0.15)', text: 'hsl(270 60% 55%)' },
  'Closed':          { bg: 'hsl(142 71% 30% / 0.2)', text: 'hsl(142 71% 30%)' },
  'Lost / Cold':     { bg: 'hsl(220 10% 50% / 0.15)', text: 'hsl(220 10% 50%)' },
};

export function LeadStatusBadge({ status }: { status: string | null }) {
  const s = status ?? 'New Lead';
  const style = STATUS_STYLES[s] ?? STATUS_STYLES['New Lead'];
  return (
    <Badge
      variant="outline"
      className="border-0 text-[10.5px] font-medium tracking-[0.01em] whitespace-nowrap px-2 py-0.5"
      style={{ background: style.bg, color: style.text }}
    >
      {s}
    </Badge>
  );
}
