import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, X } from 'lucide-react';
import { useUpdateCrmContact } from '@/hooks/useCrmLeadDetail';
import type { CrmContact } from '@/hooks/useCrmContacts';

export function LeadTagsCard({ contact }: { contact: CrmContact }) {
  const updateContact = useUpdateCrmContact();
  const [adding, setAdding] = useState(false);
  const [newTag, setNewTag] = useState('');

  const tags = (contact.tags ?? []) as string[];

  const addTag = () => {
    const tag = newTag.trim();
    if (!tag || tags.includes(tag)) return;
    updateContact.mutate({ id: contact.id, updates: { tags: [...tags, tag] } });
    setNewTag('');
    setAdding(false);
  };

  const removeTag = (tag: string) => {
    updateContact.mutate({ id: contact.id, updates: { tags: tags.filter((t) => t !== tag) } });
  };

  return (
    <div className="bg-card rounded-xl border border-border p-5 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-foreground">Tags</h3>
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setAdding(true)}>
          <Plus className="w-4 h-4" />
        </Button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {tags.map((tag) => (
          <Badge
            key={tag}
            className="border-0 text-[11px] font-semibold gap-1 pr-1.5 cursor-default"
            style={{ background: 'hsl(var(--primary) / 0.15)', color: 'hsl(var(--primary))' }}
          >
            {tag}
            <X className="w-3 h-3 cursor-pointer hover:opacity-70" onClick={() => removeTag(tag)} />
          </Badge>
        ))}
        {tags.length === 0 && !adding && (
          <span className="text-xs text-muted-foreground">No tags</span>
        )}
      </div>
      {adding && (
        <div className="flex gap-2 mt-2">
          <Input
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            placeholder="Tag name..."
            className="h-8 text-sm"
            maxLength={50}
            autoFocus
            onKeyDown={(e) => e.key === 'Enter' && addTag()}
          />
          <Button size="sm" className="h-8" onClick={addTag}>Add</Button>
          <Button size="sm" variant="ghost" className="h-8" onClick={() => { setAdding(false); setNewTag(''); }}>Cancel</Button>
        </div>
      )}
    </div>
  );
}
