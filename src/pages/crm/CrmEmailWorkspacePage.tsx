// CRM Email Workspace — 3-pane Apple-Mail-style email platform.
// Compose mode: Templates (left) · Composer (center) · Recipients (right)
// Inbox mode: synced Gmail conversations (replies, threads).

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Mail, Workflow, Megaphone, BarChart3, Activity, Send, ArrowRight, Inbox, PenSquare,
  PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen,
} from 'lucide-react';
import { TemplatesRail, type AnyTpl } from '@/components/crm/email/TemplatesRail';
import { RecipientsRail } from '@/components/crm/email/RecipientsRail';
import { ComposerSurface } from '@/components/crm/email/ComposerSurface';
import InboxView from '@/components/crm/email/InboxView';
import { PanelEdgeHandle } from '@/components/crm/leads/detail/PanelEdgeHandle';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useEffect } from 'react';
import type { CrmContact } from '@/hooks/useCrmContacts';

type Mode = 'compose' | 'inbox';

export default function CrmEmailWorkspacePage() {
  const [mode, setMode] = useState<Mode>('compose');
  const [recipients, setRecipients] = useState<CrmContact[]>([]);
  const [appliedTpl, setAppliedTpl] = useState<AnyTpl | null>(null);
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null);
  const [leftCollapsed, setLeftCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('crm.emailWorkspace.leftCollapsed') === '1';
  });
  const [rightCollapsed, setRightCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('crm.emailWorkspace.rightCollapsed') === '1';
  });

  useEffect(() => {
    localStorage.setItem('crm.emailWorkspace.leftCollapsed', leftCollapsed ? '1' : '0');
  }, [leftCollapsed]);
  useEffect(() => {
    localStorage.setItem('crm.emailWorkspace.rightCollapsed', rightCollapsed ? '1' : '0');
  }, [rightCollapsed]);

  const applyTemplate = (t: AnyTpl) => {
    setAppliedTpl(t);
    setActiveTemplateId(t.id);
  };

  const removeRecipient = (id: string) =>
    setRecipients((prev) => prev.filter((r) => r.id !== id));

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] min-h-[600px]">
      {/* Mode toggle + panel collapse controls */}
      <div className="mb-3 flex items-center justify-between gap-2 flex-wrap">
        <div className="inline-flex items-center gap-1 p-1 rounded-lg border border-border bg-card shadow-sm w-fit">
          <ModeBtn active={mode === 'compose'} onClick={() => setMode('compose')} icon={PenSquare} label="Compose" />
          <ModeBtn active={mode === 'inbox'} onClick={() => setMode('inbox')} icon={Inbox} label="Inbox" />
        </div>

        {mode === 'compose' && (
          <TooltipProvider>
            <div className="hidden lg:inline-flex items-center gap-1 p-1 rounded-lg border border-border bg-card shadow-sm">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 rounded-md text-muted-foreground hover:text-foreground"
                    onClick={() => setLeftCollapsed((v) => !v)}
                  >
                    {leftCollapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{leftCollapsed ? 'Show templates' : 'Hide templates'}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 rounded-md text-muted-foreground hover:text-foreground"
                    onClick={() => setRightCollapsed((v) => !v)}
                  >
                    {rightCollapsed ? <PanelRightOpen className="w-4 h-4" /> : <PanelRightClose className="w-4 h-4" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{rightCollapsed ? 'Show recipients' : 'Hide recipients'}</TooltipContent>
              </Tooltip>
            </div>
          </TooltipProvider>
        )}
      </div>

      <div className="flex-1 min-h-0">
        {mode === 'inbox' ? (
          <InboxView />
        ) : (
          <div className="h-full flex flex-col lg:flex-row min-h-0 rounded-xl border border-border overflow-hidden bg-card shadow-sm">
            {!leftCollapsed && (
              <div className="hidden lg:block min-h-0 w-[280px] flex-shrink-0">
                <TemplatesRail onApply={applyTemplate} activeTemplateId={activeTemplateId} />
              </div>
            )}
            <div className="hidden lg:block">
              <PanelEdgeHandle
                side="left"
                collapsed={leftCollapsed}
                onToggle={() => setLeftCollapsed((v) => !v)}
                label="Templates panel"
              />
            </div>

            <div className="min-h-0 overflow-hidden flex-1 min-w-0">
              <div className="lg:hidden flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/10">
                <Sheet>
                  <SheetTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-1.5">
                      <Mail className="h-3.5 w-3.5" />
                      Templates
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="left" className="p-0 w-[300px]">
                    <TemplatesRail onApply={(t) => { applyTemplate(t); }} activeTemplateId={activeTemplateId} />
                  </SheetContent>
                </Sheet>
                <Sheet>
                  <SheetTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-1.5 ml-auto">
                      <Send className="h-3.5 w-3.5" />
                      Recipients ({recipients.length})
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="right" className="p-0 w-[92vw] sm:w-[400px]">
                    <RecipientsRail selected={recipients} onSelectedChange={setRecipients} />
                  </SheetContent>
                </Sheet>
              </div>

              <ComposerSurface
                recipients={recipients}
                onRemoveRecipient={removeRecipient}
                onClearRecipients={() => setRecipients([])}
                appliedTemplate={appliedTpl}
                onTemplateApplied={() => setAppliedTpl(null)}
                onSent={() => setActiveTemplateId(null)}
              />
            </div>

            <div className="hidden lg:block">
              <PanelEdgeHandle
                side="right"
                collapsed={rightCollapsed}
                onToggle={() => setRightCollapsed((v) => !v)}
                label="Recipients panel"
              />
            </div>
            {!rightCollapsed && (
              <div className="hidden lg:block min-h-0 w-[380px] flex-shrink-0">
                <RecipientsRail selected={recipients} onSelectedChange={setRecipients} />
              </div>
            )}
          </div>
        )}
      </div>

      <div className="mt-3 flex items-center gap-1.5 flex-wrap text-[11px]">
        <span className="text-muted-foreground/70 uppercase tracking-wider mr-1">More:</span>
        <FooterLink to="/crm/email/legacy?tab=center" icon={Mail} label="Sent log" />
        <FooterLink to="/crm/email/legacy?tab=campaigns" icon={Megaphone} label="Campaigns" />
        <FooterLink to="/crm/email/legacy?tab=workflows" icon={Workflow} label="Flows" />
        <FooterLink to="/crm/email/legacy?tab=analytics" icon={BarChart3} label="Stats" />
        <FooterLink to="/crm/email/legacy?tab=health" icon={Activity} label="Health" />
      </div>
    </div>
  );
}

function ModeBtn({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: any; label: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium transition-colors',
        active ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground hover:bg-muted',
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

function FooterLink({ to, icon: Icon, label }: { to: string; icon: any; label: string }) {
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-1 h-6 px-2 rounded-full border border-border bg-muted/30 text-foreground/80 hover:bg-muted hover:text-foreground transition-colors"
    >
      <Icon className="h-3 w-3" />
      <span className="font-medium">{label}</span>
      <ArrowRight className="h-2.5 w-2.5 opacity-50" />
    </Link>
  );
}
