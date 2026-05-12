import { useState } from 'react';
import { Download, ExternalLink, Trash2, ScrollText } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useCrmAccess } from '@/contexts/CrmAccessContext';
import { useExportWorkspace } from '@/hooks/useLeadDataSafety';

/**
 * Settings → Data card. Admin/owner only.
 *  - Workspace-wide history ZIP export (signed URL valid 7 days)
 *  - Quick links to Trash and Audit log
 */
export function WorkspaceDataCard() {
  const { isOwnerOrAdmin } = useCrmAccess();
  const exportWs = useExportWorkspace();
  const [lastUrl, setLastUrl] = useState<string | null>(null);

  if (!isOwnerOrAdmin) return null;

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold tracking-tight">Data safety & history</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Soft-delete reversible for 30 days, then auto-purged. Audit log captures every lead change.
        </p>
      </div>

      <div className="border border-border rounded-md p-4 space-y-3">
        <div>
          <div className="text-sm font-medium">Workspace history export</div>
          <p className="text-xs text-muted-foreground mt-0.5">
            One ZIP with all leads, notes, emails, SMS, calls, showings, and audit log. Link valid 7 days.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            disabled={exportWs.isPending}
            onClick={() => exportWs.mutate(undefined, { onSuccess: (r) => setLastUrl(r.url) })}
          >
            <Download className="w-3.5 h-3.5 mr-1.5" />
            {exportWs.isPending ? 'Building…' : 'Export workspace'}
          </Button>
          {lastUrl && (
            <a href={lastUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
              <ExternalLink className="w-3 h-3" /> Download last export
            </a>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Link to="/crm/trash" className="block border border-border rounded-md p-3 hover:bg-muted/30 transition-colors">
          <div className="flex items-center gap-2 text-sm font-medium"><Trash2 className="w-3.5 h-3.5" /> Trash</div>
          <p className="text-xs text-muted-foreground mt-1">Restore or permanently delete leads.</p>
        </Link>
        <Link to="/admin/audit" className="block border border-border rounded-md p-3 hover:bg-muted/30 transition-colors">
          <div className="flex items-center gap-2 text-sm font-medium"><ScrollText className="w-3.5 h-3.5" /> Audit log</div>
          <p className="text-xs text-muted-foreground mt-1">Every lead change, who did it, and when.</p>
        </Link>
      </div>
    </div>
  );
}
