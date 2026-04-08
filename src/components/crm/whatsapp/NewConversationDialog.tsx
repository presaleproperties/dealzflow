import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Search, Phone, User } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { formatContactName } from '@/lib/format';
import { LeadStatusBadge } from '@/components/crm/leads/LeadStatusBadge';
import { Skeleton } from '@/components/ui/skeleton';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (contact: { id: string; first_name: string; last_name: string; phone: string; status: string | null }) => void;
}

export function NewConversationDialog({ open, onOpenChange, onSelect }: Props) {
  const [search, setSearch] = useState('');

  const { data: contacts = [], isLoading } = useQuery({
    queryKey: ['wa-contact-search', search],
    queryFn: async () => {
      let query = supabase
        .from('crm_contacts')
        .select('id, first_name, last_name, phone, email, status')
        .not('phone', 'is', null)
        .neq('phone', '')
        .order('first_name')
        .limit(50);

      if (search.trim()) {
        const q = `%${search.trim()}%`;
        query = query.or(`first_name.ilike.${q},last_name.ilike.${q},phone.ilike.${q},email.ilike.${q}`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
    enabled: open,
    staleTime: 5_000,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New Conversation</DialogTitle>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search contacts by name, phone, or email..."
            className="pl-9"
            autoFocus
          />
        </div>

        <div className="max-h-[350px] overflow-y-auto -mx-1">
          {isLoading ? (
            <div className="space-y-2 p-2">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}
            </div>
          ) : contacts.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              {search ? 'No contacts found with a phone number' : 'Type to search contacts'}
            </p>
          ) : (
            contacts.map(c => (
              <div
                key={c.id}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors mx-1"
                onClick={() => {
                  onSelect({ id: c.id, first_name: c.first_name, last_name: c.last_name, phone: c.phone!, status: c.status });
                  onOpenChange(false);
                  setSearch('');
                }}
              >
                <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                  style={{ background: 'hsl(142 71% 45% / 0.12)', color: 'hsl(142 71% 45%)' }}>
                  {c.first_name[0]?.toUpperCase() ?? ''}{c.last_name[0]?.toUpperCase() ?? ''}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground truncate">
                      {formatContactName(c.first_name, c.last_name)}
                    </span>
                    {c.status && <LeadStatusBadge status={c.status} />}
                  </div>
                  <div className="flex items-center gap-1 mt-0.5">
                    <Phone className="w-3 h-3 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">{c.phone}</span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
