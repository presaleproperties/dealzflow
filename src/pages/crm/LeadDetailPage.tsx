import { useParams, Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useCrmContact } from '@/hooks/useCrmLeadDetail';
import { LeadStatusBadge } from '@/components/crm/leads/LeadStatusBadge';
import { LeadContactCard } from '@/components/crm/leads/LeadContactCard';
import { LeadTagsCard } from '@/components/crm/leads/LeadTagsCard';
import { LeadActivityTimeline } from '@/components/crm/leads/LeadActivityTimeline';
import { LeadQuickActions } from '@/components/crm/leads/LeadQuickActions';
import { LeadUpcomingCard } from '@/components/crm/leads/LeadUpcomingCard';
import { LeadScoreCard } from '@/components/crm/leads/LeadScoreCard';
import { Badge } from '@/components/ui/badge';

export default function LeadDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: contact, isLoading } = useCrmContact(id);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <div className="lg:col-span-3 space-y-4">
            <Skeleton className="h-48 w-full rounded-xl" />
            <Skeleton className="h-64 w-full rounded-xl" />
          </div>
          <div className="lg:col-span-2 space-y-4">
            <Skeleton className="h-48 w-full rounded-xl" />
            <Skeleton className="h-32 w-full rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  if (!contact) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <p className="text-muted-foreground mb-4">Lead not found.</p>
        <Link to="/crm/leads" className="text-sm text-primary hover:underline">← Back to Leads</Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Back link + heading */}
      <div>
        <Link to="/crm/leads" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-3">
          <ArrowLeft className="w-4 h-4" /> Back to Leads
        </Link>
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-xl font-bold text-foreground">
            {contact.first_name} {contact.last_name}
          </h1>
          <LeadStatusBadge status={contact.status} />
          {contact.project && (
            <Badge
              variant="outline"
              className="border-0 text-[11px] font-semibold"
              style={{ background: 'hsl(39 67% 55% / 0.15)', color: 'hsl(39 67% 55%)' }}
            >
              {contact.project}
            </Badge>
          )}
        </div>
      </div>

      {/* Two columns */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Left 65% */}
        <div className="lg:col-span-3 space-y-4">
          <LeadContactCard contact={contact} />
          <LeadTagsCard contact={contact} />
          <LeadActivityTimeline contactId={contact.id} />
        </div>

        {/* Right 35% */}
        <div className="lg:col-span-2 space-y-4">
          <LeadQuickActions contact={contact} />
          <LeadUpcomingCard contactId={contact.id} />
          <LeadScoreCard contactId={contact.id} />
        </div>
      </div>
    </div>
  );
}
