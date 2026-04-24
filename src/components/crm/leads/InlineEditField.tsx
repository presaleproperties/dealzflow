import { useState, useRef, useEffect } from 'react';
import { Pencil, AlertTriangle } from 'lucide-react';
import { validateEmail, type EmailValidation } from '@/lib/emailValidation';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface InlineEditFieldProps {
  value: string | null | undefined;
  onSave: (value: string) => void;
  placeholder?: string;
  href?: string;
  className?: string;
  type?: 'text' | 'email' | 'select';
  options?: readonly string[];
}

export function InlineEditField({ value, onSave, placeholder = '—', href, className = '', type = 'text', options }: InlineEditFieldProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');
  const [emailWarning, setEmailWarning] = useState<EmailValidation>({ isValid: true, suggestion: null, correctedEmail: null });
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      setDraft(value ?? '');
      setEmailWarning({ isValid: true, suggestion: null, correctedEmail: null });
      if (type !== 'select') setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [editing, value, type]);

  const handleChange = (val: string) => {
    setDraft(val);
    if (type === 'email' && val.trim()) {
      setEmailWarning(validateEmail(val));
    } else {
      setEmailWarning({ isValid: true, suggestion: null, correctedEmail: null });
    }
  };

  const save = () => {
    const trimmed = draft.trim();
    if (trimmed !== (value ?? '').trim()) {
      onSave(trimmed);
    }
    setEditing(false);
    setEmailWarning({ isValid: true, suggestion: null, correctedEmail: null });
  };

  const fixEmail = () => {
    if (emailWarning.correctedEmail) {
      setDraft(emailWarning.correctedEmail);
      setEmailWarning({ isValid: true, suggestion: null, correctedEmail: null });
    }
  };

  // ── Select (dropdown) mode ─────────────────────────────────────
  if (type === 'select' && options) {
    if (editing) {
      return (
        <Select
          open
          value={value || undefined}
          onValueChange={(v) => {
            if (v !== (value ?? '')) onSave(v);
            setEditing(false);
          }}
          onOpenChange={(open) => { if (!open) setEditing(false); }}
        >
          <SelectTrigger className="h-7 text-xs w-auto min-w-[120px] border-primary/40">
            <SelectValue placeholder={placeholder} />
          </SelectTrigger>
          <SelectContent className="max-h-[260px]">
            {options.map((opt) => (
              <SelectItem key={opt} value={opt} className="text-xs">{opt}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }
    const display = value || placeholder;
    const isMuted = !value;
    return (
      <span
        className={`group inline-flex items-center gap-1 cursor-pointer hover:text-primary transition-colors min-w-0 ${isMuted ? 'text-muted-foreground' : ''} ${className}`}
        onClick={() => setEditing(true)}
      >
        <span className={`text-sm truncate min-w-0 ${isMuted ? 'text-muted-foreground' : 'text-foreground'}`} title={value || undefined}>{display}</span>
        <Pencil className="w-3 h-3 text-muted-foreground/0 group-hover:text-muted-foreground/60 transition-opacity flex-shrink-0" />
      </span>
    );
  }

  if (editing) {
    return (
      <div className="flex-1 min-w-0">
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => handleChange(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save();
            if (e.key === 'Escape') setEditing(false);
          }}
          className={`text-sm bg-transparent border-b outline-none text-foreground w-full ${emailWarning.suggestion ? 'border-warning' : 'border-primary/40'} ${className}`}
        />
        {emailWarning.suggestion && (
          <div className="flex items-center gap-1.5 mt-0.5">
            <AlertTriangle className="w-3 h-3 flex-shrink-0" style={{ color: 'hsl(38 92% 50%)' }} />
            <span className="text-[11px]" style={{ color: 'hsl(38 92% 50%)' }}>{emailWarning.suggestion}</span>
            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); fixEmail(); }}
              className="text-[11px] font-semibold underline"
              style={{ color: 'hsl(38 92% 50%)' }}
            >
              Fix it
            </button>
          </div>
        )}
      </div>
    );
  }

  const display = value || placeholder;
  const isMuted = !value;

  return (
    <span
      className={`group inline-flex items-center gap-1 cursor-pointer hover:text-primary transition-colors min-w-0 ${isMuted ? 'text-muted-foreground' : ''} ${className}`}
      onClick={() => setEditing(true)}
    >
      {href && value ? (
        <a
          href={href}
          className="text-sm text-primary hover:underline truncate min-w-0"
          onClick={(e) => e.stopPropagation()}
          title={display}
        >
          {display}
        </a>
      ) : (
        <span className={`text-sm truncate min-w-0 ${isMuted ? 'text-muted-foreground' : 'text-foreground'}`} title={value || undefined}>{display}</span>
      )}
      <Pencil className="w-3 h-3 text-muted-foreground/0 group-hover:text-muted-foreground/60 transition-opacity flex-shrink-0" />
    </span>
  );
}
