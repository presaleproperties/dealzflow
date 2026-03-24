import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { Send, Paperclip, Smile } from 'lucide-react';

interface Props {
  onSend: (body: string) => void;
  disabled?: boolean;
  zaraActive?: boolean;
  isLoading?: boolean;
}

export function MessageComposer({ onSend, disabled, zaraActive, isLoading }: Props) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled || isLoading) return;
    onSend(trimmed);
    setValue('');
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
  }, [value]);

  if (zaraActive) {
    return (
      <div className="flex items-center gap-2.5 px-4 py-3 border-t border-border/40 bg-primary/5">
        <span className="text-[11px] font-medium text-primary/80 flex-1">
          ⚡ Zara is handling this conversation — type to take over
        </span>
      </div>
    );
  }

  return (
    <div className="border-t border-border/40 bg-background px-3 py-2.5">
      <div className="flex items-end gap-2">
        <button
          className="flex-shrink-0 h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground/60 hover:text-foreground hover:bg-muted/60 transition-all mb-0.5"
          type="button"
        >
          <Paperclip className="h-4 w-4" />
        </button>
        <button
          className="flex-shrink-0 h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground/60 hover:text-foreground hover:bg-muted/60 transition-all mb-0.5"
          type="button"
        >
          <Smile className="h-4 w-4" />
        </button>

        <div className="flex-1 relative">
          <Textarea
            ref={textareaRef}
            value={value}
            onChange={e => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message..."
            disabled={disabled}
            className="resize-none min-h-[36px] max-h-[120px] py-2 px-3 text-[13px] leading-snug rounded-xl border-border/60 bg-muted/40 focus:bg-background"
            rows={1}
          />
        </div>

        <Button
          onClick={handleSend}
          disabled={!value.trim() || disabled || isLoading}
          size="icon"
          className={cn(
            'h-8 w-8 rounded-full flex-shrink-0 mb-0.5 transition-all duration-200',
            value.trim() ? 'opacity-100' : 'opacity-40',
          )}
        >
          <Send className="h-3.5 w-3.5" />
        </Button>
      </div>
      <p className="text-[9px] text-muted-foreground/30 mt-1 ml-20">Enter to send · Shift+Enter for new line</p>
    </div>
  );
}
