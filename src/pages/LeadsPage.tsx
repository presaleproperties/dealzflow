import { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Header } from '@/components/layout/Header';
import { useConversations, type Conversation } from '@/hooks/useConversations';
import { ConversationItem } from '@/components/leads/ConversationItem';
import { ConversationPanel } from '@/components/leads/ConversationPanel';
import { AddLeadModal } from '@/components/leads/AddLeadModal';
import { ChannelBadge } from '@/components/leads/ChannelBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { Search, Plus, Inbox, Webhook, Copy, X } from 'lucide-react';
import { toast } from 'sonner';

type ChannelFilter = 'all' | 'whatsapp' | 'sms' | 'email' | 'facebook' | 'instagram' | 'tiktok';
type StatusFilter = 'all' | 'new' | 'contacted' | 'engaged' | 'qualified' | 'booked' | 'escalated' | 'unresponsive' | 'disqualified' | 'closed';

const channelTabs: { value: ChannelFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'whatsapp', label: 'WA' },
  { value: 'sms', label: 'SMS' },
  { value: 'facebook', label: 'FB' },
  { value: 'instagram', label: 'IG' },
  { value: 'tiktok', label: 'TT' },
  { value: 'email', label: 'Email' },
];

const statusChips: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'new', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'engaged', label: 'Engaged' },
  { value: 'qualified', label: 'Qualified' },
  { value: 'booked', label: 'Booked' },
  { value: 'escalated', label: 'Escalated' },
  { value: 'unresponsive', label: 'No Reply' },
];

export default function LeadsPage() {
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [addLeadOpen, setAddLeadOpen] = useState(false);

  const { data: conversations = [], isLoading } = useConversations({
    channel: channelFilter,
    status: statusFilter,
    search: search || undefined,
  });

  const selectedConversation = conversations.find(c => c.id === selectedId) ?? null;

  // Stats summary
  const stats = {
    total: conversations.length,
    new: conversations.filter(c => c.status === 'new').length,
    zara: conversations.filter(c => c.assigned_to === 'zara').length,
    hot: conversations.filter(c => c.heat >= 70).length,
  };

  return (
    <AppLayout>
      <Header
        title="Leads"
        subtitle="Universal Inbox"
        showAddDeal={false}
        action={
          <Button
            size="sm"
            className="h-8 px-3 text-[12px] font-semibold"
            onClick={() => setAddLeadOpen(true)}
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            Add Lead
          </Button>
        }
      />

      <div className="flex h-[calc(100vh-52px)] md:h-[calc(100vh-60px)] lg:h-[calc(100vh-52px)] overflow-hidden">
        {/* Left Pane — Conversation List */}
        <div
          className={cn(
            'flex flex-col border-r border-border/40 flex-shrink-0 bg-background transition-all duration-200',
            selectedConversation ? 'w-0 hidden md:flex md:w-[300px] lg:w-[320px]' : 'w-full md:w-[300px] lg:w-[320px]',
          )}
        >
          {/* Search */}
          <div className="px-3 pt-3 pb-2 flex-shrink-0">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search leads..."
                className="pl-8 h-8 text-[12px] bg-muted/40 border-border/40"
              />
            </div>
          </div>

          {/* Stats bar */}
          <div className="px-3 pb-2 flex items-center gap-3 flex-shrink-0">
            {[
              { label: 'Total', value: stats.total },
              { label: 'New', value: stats.new, color: 'hsl(217 91% 60%)' },
              { label: '⚡ Zara', value: stats.zara, color: 'hsl(var(--primary))' },
              { label: '🔥 Hot', value: stats.hot, color: 'hsl(25 95% 53%)' },
            ].map(stat => (
              <div key={stat.label} className="flex items-center gap-1">
                <span
                  className="text-[12px] font-bold"
                  style={stat.color ? { color: stat.color } : { color: 'hsl(var(--foreground))' }}
                >
                  {stat.value}
                </span>
                <span className="text-[10px] text-muted-foreground/50">{stat.label}</span>
              </div>
            ))}
          </div>

          {/* Channel filter tabs */}
          <div className="flex items-center gap-0.5 px-2.5 pb-1.5 border-b border-border/40 overflow-x-auto scrollbar-hide flex-shrink-0">
            {channelTabs.map(tab => (
              <button
                key={tab.value}
                onClick={() => setChannelFilter(tab.value)}
                className={cn(
                  'flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold whitespace-nowrap transition-all',
                  channelFilter === tab.value
                    ? 'bg-primary/15 text-primary'
                    : 'text-muted-foreground/60 hover:text-foreground hover:bg-muted/40',
                )}
              >
                {tab.value !== 'all' && <ChannelBadge channel={tab.value} size="xs" />}
                {tab.label}
              </button>
            ))}
          </div>

          {/* Status chips */}
          <div className="flex items-center gap-1 px-2.5 py-1.5 border-b border-border/40 overflow-x-auto scrollbar-hide flex-shrink-0">
            {statusChips.map(chip => (
              <button
                key={chip.value}
                onClick={() => setStatusFilter(chip.value)}
                className={cn(
                  'px-2 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap transition-all',
                  statusFilter === chip.value
                    ? 'bg-foreground text-background'
                    : 'bg-muted/50 text-muted-foreground/70 hover:bg-muted',
                )}
              >
                {chip.label}
              </button>
            ))}
          </div>

          {/* Conversation list */}
          <div className="flex-1 overflow-y-auto">
            {isLoading && (
              <div className="space-y-0">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="px-3 py-2.5 flex items-start gap-2.5 border-b border-border/40">
                    <div className="w-9 h-9 rounded-full bg-muted/60 animate-pulse flex-shrink-0" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-3 w-24 bg-muted/60 rounded animate-pulse" />
                      <div className="h-2.5 w-32 bg-muted/40 rounded animate-pulse" />
                    </div>
                  </div>
                ))}
              </div>
            )}
            {!isLoading && conversations.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
                <Inbox className="h-10 w-10 text-muted-foreground/30 mb-3" />
                <p className="text-[13px] font-medium text-foreground/50">No leads yet</p>
                <p className="text-[11px] text-muted-foreground/40 mt-1">
                  {search || channelFilter !== 'all' || statusFilter !== 'all'
                    ? 'Try adjusting your filters'
                    : 'Add your first lead to get started'}
                </p>
                {!search && channelFilter === 'all' && statusFilter === 'all' && (
                  <Button
                    size="sm"
                    className="mt-4 h-8 text-[12px]"
                    onClick={() => setAddLeadOpen(true)}
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    Add First Lead
                  </Button>
                )}
              </div>
            )}
            {!isLoading && conversations.map(conv => (
              <ConversationItem
                key={conv.id}
                conversation={conv}
                isSelected={selectedId === conv.id}
                onSelect={setSelectedId}
              />
            ))}
          </div>
        </div>

        {/* Right Pane — Conversation Panel */}
        <div
          className={cn(
            'flex-1 flex flex-col min-w-0',
            !selectedConversation && 'hidden md:flex',
          )}
        >
          {selectedConversation ? (
            <ConversationPanel conversation={selectedConversation} />
          ) : (
            <div className="flex flex-col items-center justify-center flex-1 text-center px-8">
              <div className="text-5xl mb-4">💬</div>
              <h2 className="text-[16px] font-semibold text-foreground/70">Select a conversation</h2>
              <p className="text-[12px] text-muted-foreground/50 mt-2 max-w-[260px]">
                Choose a lead from the list to view messages, notes, and Zara activity
              </p>
            </div>
          )}
        </div>
      </div>

      <AddLeadModal open={addLeadOpen} onOpenChange={setAddLeadOpen} />
    </AppLayout>
  );
}
