// EmailIdentitySetupDialog
// ---------------------------------------------------------------------------
// Shown ONCE per user the first time they sign in. Confirms what their
// outbound emails will look like (display name, reply-to, headshot,
// signature) — all auto-pulled from Presale via `presale-agent-me`.
//
// Three states:
//   - loading    → spinner while presale identity is being fetched
//   - matched    → preview card + "Looks good" / "Edit in settings"
//   - unmatched  → input for their Presale email + "Link my account"
//
// "Acknowledged" is stored in localStorage keyed by user id so it never
// nags the same person twice.

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, CheckCircle2, MailQuestion } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";

import { useAuth } from "@/hooks/useAuth";
import { usePresaleAgent, usePresaleAgentStore } from "@/stores/usePresaleAgent";
import { supabase } from "@/integrations/supabase/client";

const ACK_KEY_PREFIX = "email-identity-setup-ack:";

function ackKey(userId: string) {
  return `${ACK_KEY_PREFIX}${userId}`;
}

export function EmailIdentitySetupDialog() {
  const { user } = useAuth();
  const { agent, status } = usePresaleAgent();
  const refresh = usePresaleAgentStore((s) => s.fetch);
  const navigate = useNavigate();

  const [open, setOpen] = useState(false);
  const [presaleEmail, setPresaleEmail] = useState("");
  const [linking, setLinking] = useState(false);

  // Decide when to open: signed-in user, not yet acknowledged, presale
  // identity check has settled (ready or unmatched).
  useEffect(() => {
    if (!user?.id) return;
    if (status !== "ready" && status !== "unmatched") return;

    try {
      const ack = localStorage.getItem(ackKey(user.id));
      if (ack) return;
    } catch {
      // localStorage unavailable — fall through and show once per session.
    }

    setOpen(true);
  }, [user?.id, status]);

  const dismiss = () => {
    if (user?.id) {
      try {
        localStorage.setItem(ackKey(user.id), new Date().toISOString());
      } catch {
        /* ignore */
      }
    }
    setOpen(false);
  };

  const handleLink = async () => {
    const trimmed = presaleEmail.trim();
    if (!trimmed) {
      toast.error("Enter your Presale email");
      return;
    }
    setLinking(true);
    try {
      const { error } = await supabase.rpc("set_my_presale_email" as any, {
        _email: trimmed,
      });
      if (error) throw error;
      toast.success("Linked. Pulling your profile…");
      // Force a fresh presale-agent-me lookup with the new override.
      await refresh({ force: true });
    } catch (e: any) {
      toast.error(e?.message ?? "Could not link your Presale account");
    } finally {
      setLinking(false);
    }
  };

  const initials = useMemo(() => {
    const n = agent?.name ?? user?.email ?? "";
    return n
      .split(/\s+/)
      .map((p) => p[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase();
  }, [agent?.name, user?.email]);

  // Don't render anything until we've decided to open.
  if (!open) return null;

  const isLoading = status === "loading" || status === "idle";
  const isMatched = status === "ready" && !!agent;
  const isUnmatched = status === "unmatched" || (status === "ready" && !agent);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        // Only allow close via explicit buttons so users see this once.
        if (!o) dismiss();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Set up your email identity</DialogTitle>
          <DialogDescription>
            This is the name, reply-to address, photo, and signature that
            will appear on every email you send from the CRM.
          </DialogDescription>
        </DialogHeader>

        {isLoading && (
          <div className="flex items-center gap-3 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Pulling your profile from Presale…
          </div>
        )}

        {!isLoading && isMatched && agent && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-lg border bg-muted/30 p-3">
              <Avatar className="h-12 w-12">
                {agent.headshotUrl && (
                  <AvatarImage src={agent.headshotUrl} alt={agent.name ?? ""} />
                )}
                <AvatarFallback>{initials || "?"}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">
                  {agent.name ?? "(no name)"}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {agent.email ?? user?.email}
                </div>
                {agent.brokerage && (
                  <div className="truncate text-xs text-muted-foreground">
                    {agent.brokerage}
                  </div>
                )}
              </div>
              <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" />
            </div>

            <div className="space-y-1 text-xs text-muted-foreground">
              <p>
                Outbound emails are sent through your branded sender domain
                with this identity attached. Replies will land in
                <span className="font-medium text-foreground">
                  {" "}
                  {agent.email ?? user?.email}
                </span>
                .
              </p>
              <p>You can change this anytime in Settings → Email.</p>
            </div>

            {agent.signatureHtml && (
              <div className="rounded-md border bg-background p-3">
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Signature preview
                </div>
                <div
                  className="prose prose-sm max-w-none text-foreground [&_*]:!text-foreground"
                  dangerouslySetInnerHTML={{ __html: agent.signatureHtml }}
                />
              </div>
            )}

            <DialogFooter className="gap-2 sm:gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  dismiss();
                  navigate("/crm/settings?tab=email");
                }}
              >
                Edit in settings
              </Button>
              <Button onClick={dismiss}>Looks good</Button>
            </DialogFooter>
          </div>
        )}

        {!isLoading && isUnmatched && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
              <MailQuestion className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
              <div className="space-y-1">
                <p className="font-medium">
                  We couldn't find your Presale agent profile.
                </p>
                <p className="text-xs text-muted-foreground">
                  Your login email{" "}
                  <span className="font-medium text-foreground">
                    {user?.email}
                  </span>{" "}
                  doesn't match any agent record in Presale. Enter the email
                  you're listed under there so we can pull your photo and
                  signature.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="presale-email">Your Presale agent email</Label>
              <Input
                id="presale-email"
                type="email"
                placeholder="you@presaleproperties.com"
                value={presaleEmail}
                onChange={(e) => setPresaleEmail(e.target.value)}
                disabled={linking}
                autoFocus
              />
              <p className="text-[11px] text-muted-foreground">
                Not sure? Ask your admin which email you're listed under in
                Presale, or skip and complete this later in Settings → Email.
              </p>
            </div>

            <DialogFooter className="gap-2 sm:gap-2">
              <Button variant="ghost" onClick={dismiss} disabled={linking}>
                Skip for now
              </Button>
              <Button onClick={handleLink} disabled={linking}>
                {linking && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
                Link my account
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
