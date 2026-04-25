import { Copy, Check } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface Props {
  value: string;
  label?: string;
  className?: string;
}

/** Tiny inline copy-to-clipboard button — appears beside emails / phones. */
export function CopyButton({ value, label, className }: Props) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success(`${label ?? 'Copied'} copied`, { duration: 1400 });
      setTimeout(() => setCopied(false), 1400);
    } catch {
      toast.error('Could not copy');
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={`Copy ${label ?? value}`}
      title={`Copy ${label ?? value}`}
      className={cn(
        'inline-flex items-center justify-center h-6 w-6 rounded-md text-muted-foreground/70 hover:text-foreground hover:bg-muted transition-all opacity-0 group-hover:opacity-100 focus-visible:opacity-100 shrink-0',
        copied && 'opacity-100 text-emerald-600 hover:text-emerald-600',
        className,
      )}
    >
      {copied ? <Check className="h-3 w-3" strokeWidth={2.5} /> : <Copy className="h-3 w-3" />}
    </button>
  );
}
