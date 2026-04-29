import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Mail, Workflow, Activity, Megaphone, BarChart3, Send, Search, X, User2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import CrmMarketingHubPage from './CrmMarketingHubPage';
// Inbox is served by CrmEmailWorkspacePage at /crm/email — no longer duplicated here.
import CrmEmailWorkflowsPage from './CrmEmailWorkflowsPage';
import CrmEmailHealthPage from './CrmEmailHealthPage';
import CrmEmailCampaignsPage from './CrmEmailCampaignsPage';
import CrmEmailAnalyticsPage from './CrmEmailAnalyticsPage';
import { ComposeEmailDialog } from '@/components/crm/leads/ComposeEmailDialog';
import { useCrmContacts } from '@/hooks/useCrmContacts';
import type { CrmContact } from '@/hooks/useCrmContacts';
import { formatContactName } from '@/lib/format';

/**
 * CRM Email — top of page is a 30-second "Quick Send" composer launcher.
 * Pick (or search) a recipient, hit Compose, and the same dialog used on
 * the Lead Detail page opens with that contact pre-filled. Templates and
 * the rest of the Email workspace live in the tabs below.
 */
export default function CrmEmailPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = searchParams.get('tab') ?? 'hub';
  const [tab, setTab] = useState(initialTab);
  const [composeContact, setComposeContact] = useState<CrmContact | null>(null);

  useEffect(() => {
    const t = searchParams.get('tab');
    if (t && t !== tab) setTab(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const handleTabChange = (v: string) => {
    setTab(v);
    const sp = new URLSearchParams(searchParams);
    sp.set('tab', v);
    setSearchParams(sp, { replace: true });
  };

  return (
    <div className="space-y-4 crm-mobile-page">
      <QuickSendBar onCompose={(c) => setComposeContact(c)} />

      <Tabs value={tab} onValueChange={handleTabChange} className="w-full space-y-4">
        <TabsList className="w-full sm:w-auto grid grid-cols-5 sm:flex h-auto">
          <TabsTrigger value="hub" className="text-[10px] sm:text-sm gap-1 sm:gap-1.5 flex-col sm:flex-row py-2"><Sparkles className="h-3.5 w-3.5" /><span>Templates</span></TabsTrigger>
          <TabsTrigger value="campaigns" className="text-[10px] sm:text-sm gap-1 sm:gap-1.5 flex-col sm:flex-row py-2"><Megaphone className="h-3.5 w-3.5" /><span>Campaigns</span></TabsTrigger>
          <TabsTrigger value="workflows" className="text-[10px] sm:text-sm gap-1 sm:gap-1.5 flex-col sm:flex-row py-2"><Workflow className="h-3.5 w-3.5" /><span>Flows</span></TabsTrigger>
          <TabsTrigger value="analytics" className="text-[10px] sm:text-sm gap-1 sm:gap-1.5 flex-col sm:flex-row py-2"><BarChart3 className="h-3.5 w-3.5" /><span>Stats</span></TabsTrigger>
          <TabsTrigger value="health" className="text-[10px] sm:text-sm gap-1 sm:gap-1.5 flex-col sm:flex-row py-2"><Activity className="h-3.5 w-3.5" /><span>Health</span></TabsTrigger>
        </TabsList>

        <TabsContent value="hub" className="mt-0">{tab === 'hub' && <CrmMarketingHubPage />}</TabsContent>
        <TabsContent value="campaigns" className="mt-0">{tab === 'campaigns' && <CrmEmailCampaignsPage />}</TabsContent>
        <TabsContent value="workflows" className="mt-0">{tab === 'workflows' && <CrmEmailWorkflowsPage />}</TabsContent>
        <TabsContent value="analytics" className="mt-0">{tab === 'analytics' && <CrmEmailAnalyticsPage />}</TabsContent>
        <TabsContent value="health" className="mt-0">{tab === 'health' && <CrmEmailHealthPage />}</TabsContent>
      </Tabs>

      {composeContact && (
        <ComposeEmailDialog
          contact={composeContact}
          open={!!composeContact}
          onOpenChange={(o) => !o && setComposeContact(null)}
        />
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Quick Send bar — pick a recipient, click Compose
   ───────────────────────────────────────────────────────────── */
function QuickSendBar({ onCompose }: { onCompose: (c: CrmContact) => void }) {
  const { data: contacts = [], isLoading } = useCrmContacts();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<CrmContact | null>(null);
  const [showResults, setShowResults] = useState(false);

  const reachable = useMemo(
    () => (contacts ?? []).filter(c => !!c.email),
    [contacts],
  );

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return reachable.slice(0, 8);
    return reachable
      .filter(c => {
        const name = formatContactName(c).toLowerCase();
        const email = (c.email ?? '').toLowerCase();
        return name.includes(q) || email.includes(q);
      })
      .slice(0, 12);
  }, [reachable, query]);

  const pick = (c: CrmContact) => {
    setSelected(c);
    setQuery('');
    setShowResults(false);
  };

  const launch = () => {
    if (selected) onCompose(selected);
  };

  return (
    <div className="rounded-2xl border border-border bg-gradient-to-br from-card via-card to-primary/[0.03] p-4 sm:p-5 shadow-sm">
      <div className="flex items-start sm:items-center justify-between gap-3 flex-col sm:flex-row mb-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-10 w-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
            <Send className="h-[18px] w-[18px] text-primary" strokeWidth={2} />
          </div>
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold tracking-tight">Send an email</h2>
            <p className="text-[11.5px] text-muted-foreground">
              Pick a recipient · pick a template or write from scratch · hit send
            </p>
          </div>
        </div>
        <Badge variant="outline" className="text-[10px] uppercase tracking-wider self-start sm:self-auto">
          ~30 seconds
        </Badge>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        {/* Recipient picker */}
        <div className="relative flex-1 min-w-0">
          {selected ? (
            <div className="flex items-center gap-2.5 h-11 px-3 rounded-lg border border-primary/40 bg-primary/[0.04]">
              <div className="h-7 w-7 rounded-full bg-primary/15 border border-primary/30 flex items-center justify-center text-[11px] font-semibold text-primary shrink-0">
                {initials(formatContactName(selected))}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13.5px] font-semibold text-foreground truncate leading-tight">
                  {formatContactName(selected)}
                </p>
                <p className="text-[11.5px] text-muted-foreground truncate leading-tight">
                  {selected.email}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Clear recipient"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <>
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <Input
                value={query}
                onChange={(e) => { setQuery(e.target.value); setShowResults(true); }}
                onFocus={() => setShowResults(true)}
                onBlur={() => setTimeout(() => setShowResults(false), 150)}
                placeholder={isLoading ? 'Loading contacts…' : 'Search lead by name or email…'}
                className="pl-9 h-11 text-sm"
                disabled={isLoading}
              />

              {showResults && matches.length > 0 && (
                <div className="absolute z-30 mt-1 left-0 right-0 max-h-72 overflow-auto rounded-lg border border-border bg-popover shadow-lg">
                  <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border/60">
                    {query.trim() ? 'Results' : 'Recent contacts'}
                  </div>
                  {matches.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onMouseDown={(e) => { e.preventDefault(); pick(c); }}
                      className="w-full text-left flex items-center gap-2.5 px-3 py-2 hover:bg-muted/60 transition-colors"
                    >
                      <div className="h-7 w-7 rounded-full bg-muted border border-border flex items-center justify-center text-[11px] font-semibold text-foreground/70 shrink-0">
                        {initials(formatContactName(c))}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-medium text-foreground truncate">
                          {formatContactName(c)}
                        </p>
                        <p className="text-[11.5px] text-muted-foreground truncate">{c.email}</p>
                      </div>
                      {c.status && (
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground shrink-0">
                          {c.status}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}

              {showResults && query.trim() && matches.length === 0 && (
                <div className="absolute z-30 mt-1 left-0 right-0 rounded-lg border border-border bg-popover shadow-lg p-4 text-center">
                  <User2 className="h-5 w-5 mx-auto text-muted-foreground/40 mb-1.5" />
                  <p className="text-[12.5px] font-medium text-muted-foreground">
                    No contact matches "{query}"
                  </p>
                  <p className="text-[11px] text-muted-foreground/70 mt-0.5">
                    Try a different name or email
                  </p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Compose button */}
        <Button
          onClick={launch}
          disabled={!selected}
          size="lg"
          className={cn(
            'h-11 gap-2 font-semibold shrink-0 sm:w-auto w-full',
            'bg-primary hover:bg-primary/90',
          )}
        >
          <Send className="h-4 w-4" />
          Compose
        </Button>
      </div>

      <p className="text-[11px] text-muted-foreground/70 mt-2.5">
        Tip: pick a template inside the composer to send a styled email in seconds.
      </p>
    </div>
  );
}

function initials(name: string): string {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
