import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { useCrmContacts } from '@/hooks/useCrmContacts';
import { getDataHealthStats } from '@/lib/dataCompleteness';

function ProgressRing({ percentage }: { percentage: number }) {
  const r = 32;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (percentage / 100) * circumference;
  const color = percentage >= 80 ? 'hsl(142 71% 45%)' : percentage >= 50 ? '#F59E0B' : '#EF4444';

  return (
    <svg width="80" height="80" className="flex-shrink-0">
      <circle cx="40" cy="40" r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth="6" />
      <circle
        cx="40" cy="40" r={r} fill="none"
        stroke={color} strokeWidth="6" strokeLinecap="round"
        strokeDasharray={circumference} strokeDashoffset={offset}
        transform="rotate(-90 40 40)"
        className="transition-all duration-700"
      />
      <text x="40" y="40" textAnchor="middle" dominantBaseline="central"
        className="text-sm font-bold fill-foreground"
      >
        {percentage}%
      </text>
    </svg>
  );
}

export function DataHealthCard() {
  const navigate = useNavigate();
  const { data: contacts = [] } = useCrmContacts();
  const stats = getDataHealthStats(contacts);

  if (stats.total === 0) return null;

  return (
    <Card className="border-border bg-card">
      <CardContent className="p-4 flex items-center gap-4">
        <ProgressRing percentage={stats.percentage} />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">Past Client Data Health</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {stats.complete} of {stats.total} past clients have complete profiles
          </p>
          {stats.incomplete > 0 && (
            <button
              onClick={() => navigate('/crm/contacts?type=past_client&data_status=incomplete')}
              className="text-xs font-medium mt-1.5 hover:underline"
              style={{ color: '#F59E0B' }}
            >
              View Incomplete →
            </button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
