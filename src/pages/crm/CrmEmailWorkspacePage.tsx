// CRM Email Workspace — 3-pane Apple-Mail-style email platform.
// Templates (left) · Composer (center, always-on) · Recipients (right).
// Footer strip links to the existing sub-tabs (Sent/Campaigns/Flows/Stats/Health).

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, Workflow, Megaphone, BarChart3, Activity, Send, ArrowRight } from 'lucide-react';
import { TemplatesRail, type AnyTpl } from '@/components/crm/email/TemplatesRail';
import { RecipientsRail } from '@/components/crm/email/RecipientsRail';
import { ComposerSurface } from '@/components/crm/email/ComposerSurface';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import type { CrmContact } from '@/hooks/useCrmContacts';

export default function CrmEmailWorkspacePage() {
  const [recipients, setRecipients] = useState<CrmContact[]>([]);
  const [appliedTpl, setAppliedTpl] = useState<AnyTpl | null>(null);
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null);

  const applyTemplate = (t: AnyTpl) => {
    setAppliedTpl(t);
    setActiveTemplateId(t.id);
  };

  const removeRecipient = (id: string) =>
    setRecipients((prev) => prev.filter((r) => r.id !== id));

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] min-h-[600px]">
      {/* 3-pane workspace */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[260px_1fr_320px] min-h-0 rounded-xl border border-border overflow-hidden bg-card">
        {/* Left: templates (desktop) / drawer (mobile) */}
        <div className="hidden lg:block min-h-0">
          <TemplatesRail
            onApply={applyTemplate}
            activeTemplateId={activeTemplateId}
          />
        </div>

        {/* Center: composer */}
        <div className="min-h-0 overflow-hidden">
          {/* Mobile rails as buttons */}
          <div className="lg:hidden flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/10">
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5">
                  <Mail className="h-3.5 w-3.5" />
                  Templates
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="p-0 w-[300px]">
                <TemplatesRail
                  onApply={(t) => { setAppliedTpl(t); }}
                  activeTemplateId={appliedTpl?.id ?? null}
                />
              </SheetContent>
            </Sheet>
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5 ml-auto">
                  <Send className="h-3.5 w-3.5" />
                  Recipients ({recipients.length})
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="p-0 w-[340px]">
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
          />
        </div>

        {/* Right: recipients (desktop) */}
        <div className="hidden lg:block min-h-0">
          <RecipientsRail selected={recipients} onSelectedChange={setRecipients} />
        </div>
      </div>

      {/* Footer strip — quick access to existing sub-tools */}
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
