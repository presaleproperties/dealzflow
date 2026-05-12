import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCrmAccess } from '@/contexts/CrmAccessContext';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';

const CHECKLIST_ITEMS: Array<{ key: string; title: string; help: string }> = [
  {
    key: 'admins_capped',
    title: '≤ 2 admins on this workspace',
    help: 'Reviewed Settings → Members and confirmed at most two people hold admin/owner role.',
  },
  {
    key: 'two_factor_enabled',
    title: '2FA enabled on Lovable, Supabase, Google, and Stripe',
    help: 'Two-factor authentication is active on every account that touches production data.',
  },
  {
    key: 'manual_full_backup',
    title: 'Manual full backup run at least once',
    help: 'Used Data Manager → Full ZIP export to download a complete archive and stored it offline.',
  },
  {
    key: 'gdrive_daily_backup',
    title: 'Daily Google Drive backup connected and ran today',
    help: 'Verified the scheduled Drive backup completed in the last 24 hours.',
  },
];

interface ChecklistEntry {
  checked?: boolean;
  checked_at?: string;
  checked_by_label?: string;
  unchecked_at?: string;
  unchecked_by_label?: string;
}

type Checklist = Record<string, ChecklistEntry>;

export default function DataSafetyChecklistCard() {
  const { isOwnerOrAdmin } = useCrmAccess();
  const qc = useQueryClient();

  const { data: settings, isLoading } = useQuery({
    queryKey: ['crm-team-settings'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('crm_team_settings')
        .select('data_safety_checklist, updated_at')
        .eq('singleton', true)
        .maybeSingle();
      if (error) throw error;
      return data as { data_safety_checklist: Checklist | null; updated_at: string } | null;
    },
    staleTime: 30_000,
  });

  const checklist: Checklist = settings?.data_safety_checklist ?? {};

  const setItem = useMutation({
    mutationFn: async ({ key, checked }: { key: string; checked: boolean }) => {
      const { error } = await (supabase as any).rpc('crm_set_data_safety_check', {
        _key: key,
        _checked: checked,
        _note: null,
      });
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      toast.success(vars.checked ? 'Marked complete' : 'Cleared');
      qc.invalidateQueries({ queryKey: ['crm-team-settings'] });
    },
    onError: (err) => toast.error(`Update failed: ${(err as Error).message}`),
  });

  const completed = useMemo(
    () => CHECKLIST_ITEMS.filter((it) => checklist[it.key]?.checked).length,
    [checklist]
  );

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold text-foreground">Data safety checklist</span>
          </div>
          <span className="text-[11px] text-muted-foreground tabular-nums">
            {completed}/{CHECKLIST_ITEMS.length} complete
          </span>
        </div>

        <p className="text-[11px] text-muted-foreground">
          Manual checklist for workspace admins. Items don't auto-detect — re-confirm them after any
          change to admins, MFA setup, or backup schedules.
        </p>

        <ul className="space-y-2">
          {CHECKLIST_ITEMS.map((item) => {
            const entry = checklist[item.key];
            const checked = !!entry?.checked;
            return (
              <li
                key={item.key}
                className="flex items-start gap-3 rounded-md border border-border/60 bg-card/40 p-3"
              >
                <Checkbox
                  checked={checked}
                  disabled={!isOwnerOrAdmin || setItem.isPending || isLoading}
                  onCheckedChange={(v) => setItem.mutate({ key: item.key, checked: !!v })}
                  className="mt-0.5"
                />
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium text-foreground">{item.title}</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">{item.help}</div>
                  {checked && entry?.checked_at && (
                    <div className="text-[10.5px] text-emerald-600 mt-1">
                      Confirmed{' '}
                      {formatDistanceToNow(new Date(entry.checked_at), { addSuffix: true })}
                      {entry.checked_by_label ? ` by ${entry.checked_by_label}` : ''}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>

        {!isOwnerOrAdmin && (
          <p className="text-[11px] text-muted-foreground italic">
            Only admins can change these check-offs.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
