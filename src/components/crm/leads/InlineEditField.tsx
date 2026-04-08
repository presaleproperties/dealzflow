import { useState, useRef, useEffect } from 'react';
import { Pencil } from 'lucide-react';

interface InlineEditFieldProps {
  value: string | null | undefined;
  onSave: (value: string) => void;
  placeholder?: string;
  href?: string;
  className?: string;
}

export function InlineEditField({ value, onSave, placeholder = '—', href, className = '' }: InlineEditFieldProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      setDraft(value ?? '');
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [editing, value]);

  const save = () => {
    const trimmed = draft.trim();
    if (trimmed !== (value ?? '').trim()) {
      onSave(trimmed);
    }
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === 'Enter') save();
          if (e.key === 'Escape') setEditing(false);
        }}
        className={`text-sm bg-transparent border-b border-primary/40 outline-none text-foreground w-full ${className}`}
      />
    );
  }

  const display = value || placeholder;
  const isMuted = !value;

  return (
    <span
      className={`group inline-flex items-center gap-1 cursor-pointer hover:text-primary transition-colors ${isMuted ? 'text-muted-foreground' : ''} ${className}`}
      onClick={() => setEditing(true)}
    >
      {href && value ? (
        <a
          href={href}
          className="text-sm text-primary hover:underline truncate"
          onClick={(e) => e.stopPropagation()}
        >
          {display}
        </a>
      ) : (
        <span className={`text-sm truncate ${isMuted ? 'text-muted-foreground' : 'text-foreground'}`}>{display}</span>
      )}
      <Pencil className="w-3 h-3 text-muted-foreground/0 group-hover:text-muted-foreground/60 transition-opacity flex-shrink-0" />
    </span>
  );
}
