// CRM Email — Inbox-only surface.
// Tier 2: Outbound (Templates / Campaigns / Flows) and Reports (Stats / Health)
// were removed from this workspace. Campaigns now live at /crm/campaigns;
// templates at /crm/templates; flows at /crm/automations; analytics at
// /crm/reports; health at /crm/integrations. The Inbox itself is mounted by
// CrmInboxPage when ?channel=email is active.
//
// The legacy hub modules (CrmMarketingHubPage, CrmEmailCampaignsPage, etc.)
// are intentionally NOT deleted — their data is still reachable from
// /crm/campaigns and /crm/templates. We just no longer render them here.

import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Megaphone, PenSquare } from 'lucide-react';
import InboxView from '@/components/crm/email/InboxView';
import { NewEmailLauncherDialog } from '@/components/crm/email/NewEmailLauncherDialog';
import { EmailLiveStatusBar } from '@/components/crm/shared/LiveStatusBar';
import { Button } from '@/components/ui/button';

export default function CrmEmailWorkspacePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [composerOpen, setComposerOpen] = useState(false);

  // Legacy ?tab=compose → just open the composer.
  useEffect(() => {
    const t = searchParams.get('tab');
    if (t === 'compose') {
      setComposerOpen(true);
      const sp = new URLSearchParams(searchParams);
      sp.delete('tab');
      setSearchParams(sp, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col h-full min-h-0 lg:h-[calc(100dvh-140px)] lg:min-h-[600px]">
      <div className="hidden md:block mb-2"><EmailLiveStatusBar /></div>

      {/* Editorial header — single-row CTA bar */}
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <h1 className="text-[13.5px] font-semibold tracking-tight">Inbox</h1>
        <div className="flex items-center gap-2">
          <Button asChild size="sm" variant="ghost" className="h-9 gap-1.5 text-[12.5px]">
            <Link to="/crm/campaigns">
              <Megaphone className="h-3.5 w-3.5" />
              View campaigns
            </Link>
          </Button>
          <Button
            onClick={() => setComposerOpen(true)}
            className="shrink-0 h-9 gap-1.5 text-[12.5px] font-semibold"
          >
            <PenSquare className="h-3.5 w-3.5" />
            New Email
          </Button>
        </div>
      </div>

      <div className="flex-1 min-h-0">
        <InboxView />
      </div>

      <NewEmailLauncherDialog
        open={composerOpen}
        onOpenChange={setComposerOpen}
      />
    </div>
  );
}
