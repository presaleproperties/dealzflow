import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { BridgeTemplate } from '@/hooks/useBridgeEmail';

export function PresaleTemplatePreviewDialog({
  asset,
  open,
  onOpenChange,
}: {
  asset: BridgeTemplate | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>{asset?.name ?? ''}</DialogTitle>
        </DialogHeader>
        {asset?.subject && (
          <p className="text-sm">
            <span className="font-medium">Subject:</span> {asset.subject}
          </p>
        )}
        <iframe
          srcDoc={asset?.body_html ?? ''}
          className="w-full border rounded-lg bg-white"
          style={{ height: '60vh' }}
          sandbox="allow-same-origin"
          title="Template Preview"
        />
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
