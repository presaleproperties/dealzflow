import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AUTOMATION_TEMPLATES } from '@/hooks/useCrmAutomations';
import {
  Zap, Clock, Mail, Bell, Tag, RefreshCw, UserPlus,
} from 'lucide-react';

const ICON_MAP: Record<string, React.ElementType> = {
  Zap, Clock, Mail, Bell, Tag, RefreshCw, UserPlus,
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (template: typeof AUTOMATION_TEMPLATES[number]) => void;
}

export function TemplatePickerDialog({ open, onOpenChange, onSelect }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[85dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Choose a Template</DialogTitle>
          <p className="text-sm text-muted-foreground">Start with a pre-built automation and customize it</p>
        </DialogHeader>

        <div className="grid gap-3 mt-2">
          {AUTOMATION_TEMPLATES.map(tpl => {
            const Icon = ICON_MAP[tpl.icon] ?? Zap;
            return (
              <div
                key={tpl.id}
                className="flex items-start gap-3 p-4 rounded-xl border border-border/50 bg-card/50 hover:bg-card hover:border-primary/30 cursor-pointer transition-all group"
                onClick={() => {
                  onSelect(tpl);
                  onOpenChange(false);
                }}
              >
                <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">{tpl.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{tpl.description}</p>
                </div>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
