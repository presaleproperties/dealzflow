import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { motion, AnimatePresence } from 'framer-motion';
import { Target, Check, Pencil, Plus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

const TODAY = format(new Date(), 'yyyy-MM-dd');
const MAX_ITEMS = 3;

interface FocusItem {
  id: string;
  position: number;
  text: string;
  completed: boolean;
  date: string;
}

// ─── Hook ──────────────────────────────────────────────────────────────────────
function useTodaysFocus() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const uid = user?.id;

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['daily-focus', uid, TODAY],
    queryFn: async () => {
      const { data } = await supabase
        .from('daily_focus')
        .select('id,position,text,completed,date')
        .eq('user_id', uid!)
        .eq('date', TODAY)
        .order('position', { ascending: true });
      return (data ?? []) as FocusItem[];
    },
    enabled: !!uid,
  });

  const upsert = useMutation({
    mutationFn: async (item: Partial<FocusItem> & { position: number }) => {
      await supabase.from('daily_focus').upsert(
        { user_id: uid, date: TODAY, ...item },
        { onConflict: 'user_id,date,position' },
      );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['daily-focus', uid, TODAY] }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from('daily_focus').delete().eq('id', id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['daily-focus', uid, TODAY] }),
  });

  return { items, isLoading, upsert, remove };
}

// ─── Single focus row ──────────────────────────────────────────────────────────
function FocusRow({
  item,
  onToggle,
  onSave,
  onDelete,
}: {
  item: FocusItem;
  onToggle: () => void;
  onSave: (text: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.text);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed !== item.text) onSave(trimmed);
    setEditing(false);
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4, scale: 0.97 }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        'group flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200',
        item.completed ? 'bg-muted/20' : 'bg-card/60 border border-border/40',
        'hover:bg-muted/30',
      )}
    >
      {/* Checkbox */}
      <button
        onClick={onToggle}
        className={cn(
          'w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all duration-200',
          item.completed
            ? 'border-success bg-success text-success-foreground'
            : 'border-border/60 hover:border-primary',
        )}
      >
        <AnimatePresence>
          {item.completed && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            >
              <Check className="w-2.5 h-2.5" />
            </motion.span>
          )}
        </AnimatePresence>
      </button>

      {/* Text / edit input */}
      {editing ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={e => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') { setDraft(item.text); setEditing(false); }
          }}
          className="flex-1 bg-transparent text-sm font-medium text-foreground outline-none border-b border-primary/50 pb-0.5"
          maxLength={80}
        />
      ) : (
        <span
          className={cn(
            'flex-1 text-sm font-medium transition-all duration-200 cursor-pointer select-none',
            item.completed
              ? 'line-through text-muted-foreground/50'
              : 'text-foreground',
          )}
          onDoubleClick={() => !item.completed && setEditing(true)}
        >
          {item.text || <span className="text-muted-foreground/40 italic">Click pencil to set priority…</span>}
        </span>
      )}

      {/* Actions — appear on hover */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150 shrink-0">
        {!item.completed && (
          <button
            onClick={() => setEditing(true)}
            className="w-6 h-6 rounded-lg flex items-center justify-center text-muted-foreground/50 hover:text-primary hover:bg-primary/10 transition-colors"
          >
            <Pencil className="w-3 h-3" />
          </button>
        )}
        <button
          onClick={onDelete}
          className="w-6 h-6 rounded-lg flex items-center justify-center text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-colors"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    </motion.div>
  );
}

// ─── New item placeholder ──────────────────────────────────────────────────────
function AddRow({ position, onAdd }: { position: number; onAdd: (text: string) => void }) {
  const [active, setActive] = useState(false);
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (active) inputRef.current?.focus(); }, [active]);

  const commit = () => {
    const trimmed = text.trim();
    if (trimmed) onAdd(trimmed);
    setText('');
    setActive(false);
  };

  if (!active) {
    return (
      <button
        onClick={() => setActive(true)}
        className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl border border-dashed border-border/40 w-full text-left text-xs text-muted-foreground/50 hover:border-primary/30 hover:text-primary/60 hover:bg-primary/5 transition-all duration-200"
      >
        <Plus className="w-3.5 h-3.5" />
        Add priority #{position}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-primary/30 bg-primary/5">
      <div className="w-5 h-5 rounded-full border-2 border-border/60 shrink-0" />
      <input
        ref={inputRef}
        value={text}
        onChange={e => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') { setText(''); setActive(false); }
        }}
        placeholder={`What's priority #${position} today?`}
        className="flex-1 bg-transparent text-sm font-medium text-foreground outline-none placeholder:text-muted-foreground/40"
        maxLength={80}
      />
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────
export function TodaysFocus() {
  const { items, isLoading, upsert, remove } = useTodaysFocus();
  const completedCount = items.filter(i => i.completed).length;
  const allDone = items.length === MAX_ITEMS && completedCount === MAX_ITEMS;
  const usedPositions = new Set(items.map(i => i.position));
  const openSlots = [1, 2, 3].filter(p => !usedPositions.has(p));

  return (
    <div className="card-premium overflow-hidden flex flex-col">
      {/* Header */}
      <div className="px-5 py-4 border-b border-border/40 flex items-center gap-2.5 shrink-0">
        <div className={cn(
          'w-1.5 h-1.5 rounded-full transition-colors',
          allDone ? 'bg-success' : 'bg-primary',
        )} />
        <h2 className="text-sm font-semibold text-foreground flex-1">Today's Focus</h2>
        <div className="flex items-center gap-2">
          {items.length > 0 && (
            <span className={cn(
              'text-xs font-bold px-2 py-0.5 rounded-full transition-all',
              allDone
                ? 'bg-success/15 text-success'
                : 'bg-muted/60 text-muted-foreground',
            )}>
              {completedCount}/{MAX_ITEMS}
            </span>
          )}
          <span className="text-[10.5px] text-muted-foreground/50">
            {format(new Date(), 'MMM d')}
          </span>
        </div>
      </div>

      {/* All-done banner */}
      <AnimatePresence>
        {allDone && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="mx-4 mt-4 px-4 py-3 rounded-xl bg-success/10 border border-success/20 text-center">
              <span className="text-sm font-semibold text-success">
                🎯 All 3 priorities done — great work, Uzair!
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Items */}
      <div className="p-4 space-y-2.5">
        {isLoading ? (
          <div className="space-y-2.5">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-11 rounded-xl bg-muted/30 animate-pulse" />
            ))}
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {items.map(item => (
              <FocusRow
                key={item.id}
                item={item}
                onToggle={() => upsert.mutate({ position: item.position, completed: !item.completed })}
                onSave={text => upsert.mutate({ position: item.position, text })}
                onDelete={() => remove.mutate(item.id)}
              />
            ))}
            {openSlots.map(pos => (
              <motion.div
                key={`slot-${pos}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: pos * 0.05, duration: 0.2 }}
              >
                <AddRow
                  position={pos}
                  onAdd={text => upsert.mutate({ position: pos, text, completed: false })}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>

      {/* Progress bar */}
      {items.length > 0 && (
        <div className="px-4 pb-4">
          <div className="h-1 rounded-full bg-muted/30 overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-primary to-success"
              initial={{ width: 0 }}
              animate={{ width: `${(completedCount / MAX_ITEMS) * 100}%` }}
              transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
