import { useNavigate } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useZaraPin } from '@/hooks/useZaraPin';

type Props = { contactId: string; className?: string; label?: string };

/** Pins the lead and jumps into the Zara cockpit with a primed prompt. */
export function AskZaraButton({ contactId, className, label = 'Ask Zara' }: Props) {
  const navigate = useNavigate();
  const { setPinnedId } = useZaraPin();
  return (
    <Button
      variant="outline"
      size="sm"
      className={className ?? 'h-9 text-xs gap-1.5 justify-start col-span-2'}
      onClick={() => {
        setPinnedId(contactId);
        navigate('/crm/zara?prompt=' + encodeURIComponent('Give me a one-paragraph summary of the pinned lead and three next-best actions.'));
      }}
    >
      <Sparkles className="w-3.5 h-3.5 text-primary" />
      {label}
    </Button>
  );
}
