import { useMemo, useState, useRef, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Pill } from '@/components/crm/shared/Pill';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, X, Check, Sparkles } from 'lucide-react';
import { useUpdateCrmContact } from '@/hooks/useCrmLeadDetail';
import { useCrmTags, useCreateCrmTag } from '@/hooks/useCrmTags';
import type { CrmContact } from '@/hooks/useCrmContacts';
import { cn } from '@/lib/utils';

export function LeadTagsCard({ contact }: { contact: CrmContact }) {
  const updateContact = useUpdateCrmContact();
  const { data: allTags = [] } = useCrmTags();
  const createTag = useCreateCrmTag();

  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState('');
  const popoverRef = useRef<HTMLDivElement>(null);

  const tags = (contact.tags ?? []) as string[];
  const tagsLower = useMemo(() => new Set(tags.map(t => t.toLowerCase())), [tags]);

  // Suggestions = full library minus tags this contact already has, ranked by usage
  const suggestions = useMemo(() => {
    const list = allTags
      .filter(t => !tagsLower.has(t.name.toLowerCase()))
      .map(t => ({ label: t.name, count: t.usage_count }));
    if (!query.trim()) return list;
    const q = query.toLowerCase();
    return list.filter(item => item.label.toLowerCase().includes(q));
  }, [allTags, tagsLower, query]);

  // Close on outside click
  useEffect(() => {
    if (!adding) return;
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setAdding(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [adding]);

  const addTag = (raw: string) => {
    const tag = raw.trim();
    if (!tag) return;
    if (tagsLower.has(tag.toLowerCase())) {
      setQuery('');
      return;
    }
    // Add to contact (trigger upserts into crm_tags automatically)
    updateContact.mutate({ id: contact.id, updates: { tags: [...tags, tag] } });
    // If brand-new, also pre-create in library so it appears immediately for others
    const exists = allTags.some(t => t.name.toLowerCase() === tag.toLowerCase());
    if (!exists) createTag.mutate(tag);
    setQuery('');
  };

  const removeTag = (tag: string) => {
    updateContact.mutate({ id: contact.id, updates: { tags: tags.filter(t => t !== tag) } });
  };

  const queryMatchesExisting = useMemo(
    () => allTags.some(t => t.name.toLowerCase() === query.trim().toLowerCase()),
    [allTags, query],
  );
  const showCreateOption = query.trim().length > 0 && !queryMatchesExisting && !tagsLower.has(query.trim().toLowerCase());


  return (
    <div className="bg-card rounded-xl border border-border p-5 shadow-sm relative">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-foreground">Tags</h3>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 text-xs"
          onClick={() => setAdding(v => !v)}
        >
          <Plus className="w-3.5 h-3.5" />
          Add
        </Button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {tags.map(tag => (
          <Pill key={tag} tone="primary" className="pr-1 gap-1">
            {tag}
            <button
              type="button"
              onClick={() => removeTag(tag)}
              className="hover:opacity-70 transition-opacity"
              aria-label={`Remove ${tag}`}
            >
              <X className="w-2.5 h-2.5" />
            </button>
          </Pill>
        ))}
        {tags.length === 0 && !adding && (
          <button
            onClick={() => setAdding(true)}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            No tags — add one
          </button>
        )}
      </div>

      {adding && (
        <div ref={popoverRef} className="mt-3 border border-border rounded-lg bg-popover shadow-lg overflow-hidden">
          <div className="p-2 border-b border-border/40">
            <Input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search or create a tag..."
              className="h-8 text-sm border-0 shadow-none focus-visible:ring-0 px-2"
              maxLength={50}
              autoFocus
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (suggestions.length > 0 && !showCreateOption) {
                    addTag(suggestions[0].label);
                  } else if (query.trim()) {
                    addTag(query);
                  }
                } else if (e.key === 'Escape') {
                  setAdding(false);
                  setQuery('');
                }
              }}
            />
          </div>

          <div className="max-h-64 overflow-y-auto">
            {showCreateOption ? (
              <button
                onClick={() => addTag(query)}
                className="flex items-center gap-2 w-full px-3 py-2.5 text-xs font-medium text-primary hover:bg-primary/10 transition-colors border-b border-border/30 bg-primary/5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>
                  Add new tag <span className="font-semibold">"{query.trim()}"</span>
                </span>
              </button>
            ) : (
              <button
                onClick={() => {
                  // Focus search so user can type a new tag name
                  const input = popoverRef.current?.querySelector('input');
                  input?.focus();
                }}
                className="flex items-center gap-2 w-full px-3 py-2.5 text-xs font-medium text-primary hover:bg-primary/10 transition-colors border-b border-border/30"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add new tag…</span>
              </button>
            )}

            {suggestions.length === 0 && !showCreateOption && (
              <div className="px-3 py-4 text-xs text-muted-foreground text-center">
                {query ? 'No matching tags' : 'Type above to create your first tag'}
              </div>
            )}

            {suggestions.map(item => (
              <button
                key={item.label}
                onClick={() => addTag(item.label)}
                className={cn(
                  'flex items-center justify-between w-full px-3 py-1.5 text-xs hover:bg-muted/40 transition-colors',
                )}
              >
                <span className="flex items-center gap-2 truncate">
                  <Check className="w-3 h-3 opacity-0" />
                  <span className="truncate text-foreground">{item.label}</span>
                </span>
                <span className="text-[10px] text-muted-foreground tabular-nums shrink-0 ml-2">
                  {item.count}
                </span>
              </button>
            ))}
          </div>

          <div className="px-3 py-1.5 border-t border-border/40 text-[10px] text-muted-foreground bg-muted/20 flex items-center justify-between">
            <span>Enter to add · Esc to close</span>
            <span className="tabular-nums">{suggestions.length} {query ? 'matching' : 'available'}</span>
          </div>
        </div>
      )}
    </div>
  );
}
