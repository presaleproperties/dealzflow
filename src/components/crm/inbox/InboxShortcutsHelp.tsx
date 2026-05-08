import { useState } from 'react';
import { Keyboard } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';

const SHORTCUTS: { keys: string[]; desc: string }[] = [
  { keys: ['j'], desc: 'Next message' },
  { keys: ['k'], desc: 'Previous message' },
  { keys: ['Enter'], desc: 'Open selected' },
  { keys: ['e'], desc: 'Archive' },
  { keys: ['r'], desc: 'Reply' },
  { keys: ['u'], desc: 'Mark unread' },
  { keys: ['/'], desc: 'Focus search' },
  { keys: ['?'], desc: 'Toggle this help' },
  { keys: ['⌘', 'Enter'], desc: 'Send reply' },
];

export function InboxShortcutsHelp() {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
          aria-label="Keyboard shortcuts"
        >
          <Keyboard className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={6} className="w-72 p-3">
        <div className="text-[11px] uppercase tracking-[0.16em] font-semibold text-muted-foreground mb-2">
          Keyboard shortcuts
        </div>
        <ul className="space-y-1.5">
          {SHORTCUTS.map((s) => (
            <li key={s.desc} className="flex items-center justify-between text-[12.5px]">
              <span className="text-foreground/85">{s.desc}</span>
              <span className="flex gap-1">
                {s.keys.map((k) => (
                  <kbd key={k} className="inbox-kbd">{k}</kbd>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
