import { useState } from 'react';
import { Plus, Pencil } from 'lucide-react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useCrmEmailTemplates } from '@/hooks/useCrmEmail';
import { TemplateEditorDialog } from '@/components/crm/templates/TemplateEditorDialog';
import type { CrmEmailTemplate } from '@/hooks/useCrmEmail';

export default function CrmTemplatesPage() {
  const { data: templates = [], isLoading } = useCrmEmailTemplates();
  const [editing, setEditing] = useState<CrmEmailTemplate | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <div>
      <div className="flex items-center justify-between mb-4 sm:mb-5">
        <h1 className="text-lg font-bold text-foreground">Templates</h1>
        <Button size="sm" className="gap-1.5 bg-[hsl(39_67%_55%)] hover:bg-[hsl(39_67%_48%)] text-white min-h-[44px] sm:min-h-0" onClick={() => setCreating(true)}>
          <Plus className="w-4 h-4" /> Create Template
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-44 rounded-xl" />)}
        </div>
      ) : templates.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-16">No templates yet. Create your first one!</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {templates.map(tpl => (
            <div
              key={tpl.id}
              className="group relative bg-card border border-border rounded-[10px] lg:rounded-xl p-3 sm:p-4 lg:p-5 shadow-sm hover:shadow-md transition-shadow cursor-pointer active:bg-muted/30"
              onClick={() => setEditing(tpl)}
            >
              <h3 className="text-sm font-semibold text-foreground mb-1 truncate">{tpl.name}</h3>
              <p className="text-xs text-muted-foreground truncate mb-3">{tpl.subject}</p>

              {tpl.project && (
                <Badge variant="outline" className="border-0 text-[10px] font-semibold mb-3" style={{ background: 'hsl(39 67% 55% / 0.15)', color: 'hsl(39 67% 55%)' }}>
                  {tpl.project}
                </Badge>
              )}

              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>Used {tpl.times_used ?? 0} times</span>
                <span>{tpl.last_used_at ? format(new Date(tpl.last_used_at), 'MMM d') : 'Never used'}</span>
              </div>

              <div className="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={(e) => { e.stopPropagation(); setEditing(tpl); }}>
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <TemplateEditorDialog
        template={editing}
        open={creating || !!editing}
        onOpenChange={(open) => { if (!open) { setEditing(null); setCreating(false); } }}
      />
    </div>
  );
}
