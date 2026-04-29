import { useState } from 'react';
import { StepShell } from '../StepShell';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Eye, EyeOff, Plug, RefreshCw, Check } from 'lucide-react';
import { useUpsertConnection, useSyncPlatform, usePlatformConnections } from '@/hooks/usePlatformConnections';
import { toast } from 'sonner';

interface Props {
  eyebrow: string;
  onBack: () => void;
  onNext: () => void;
  onSkip: () => void;
}

export function StepConnectReZen({ eyebrow, onBack, onNext, onSkip }: Props) {
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const upsert = useUpsertConnection();
  const sync = useSyncPlatform();
  const { data: connections = [] } = usePlatformConnections();
  const existing = connections.find((c) => c.platform === 'real_broker');

  const handleConnect = async () => {
    if (!apiKey.trim()) return;
    setConnecting(true);
    try {
      const conn = await upsert.mutateAsync({ platform: 'real_broker', api_key: apiKey.trim() });
      try {
        await sync.mutateAsync({ platform: 'real_broker', connectionId: conn.id });
      } catch {
        /* sync errors are non-fatal */
      }
      toast.success('ReZen connected — your deals are syncing');
      onNext();
    } catch (err: any) {
      toast.error(err.message || 'Failed to connect');
    } finally {
      setConnecting(false);
    }
  };

  const isConnected = !!existing;

  return (
    <StepShell
      eyebrow={eyebrow}
      title="Connect ReZen"
      subtitle="Auto-syncs deals, commissions, and revenue share. Optional but strongly recommended — without it, you'll add deals manually."
      primaryLabel={isConnected ? 'Continue' : 'Connect & sync'}
      primaryLoading={connecting}
      primaryDisabled={!isConnected && !apiKey.trim()}
      onBack={onBack}
      onSkip={onSkip}
      skipLabel="Skip — I'll connect later"
      onPrimary={isConnected ? onNext : handleConnect}
    >
      {isConnected ? (
        <div className="p-4 rounded-xl bg-success/10 border border-success/20 flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-success/20 flex items-center justify-center">
            <Check className="w-4 h-4 text-success" />
          </div>
          <div>
            <p className="text-sm font-semibold text-success">ReZen is connected</p>
            <p className="text-xs text-muted-foreground">Your transactions sync daily at 6 AM UTC.</p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-muted/40 border border-border/40 text-sm">
            <p className="font-medium text-foreground mb-1.5">How to get your API key</p>
            <ol className="space-y-1 list-decimal list-inside text-muted-foreground">
              <li>Sign in at <code className="font-mono text-xs bg-background/60 px-1.5 py-0.5 rounded border border-border/40">app.therealbrokerage.com</code></li>
              <li>Open <strong>Profile → API Keys</strong></li>
              <li>Create a new key and paste it below</li>
            </ol>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ob-rezen-key">ReZen API Key</Label>
            <div className="relative">
              <Input
                id="ob-rezen-key"
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Paste your API key"
                className="pr-10 h-11 font-mono text-sm"
              />
              <button
                type="button"
                onClick={() => setShowKey((s) => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>
      )}
    </StepShell>
  );
}
