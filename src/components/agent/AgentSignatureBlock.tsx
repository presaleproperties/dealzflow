import DOMPurify from "isomorphic-dompurify";
import { cn } from "@/lib/utils";
import { usePresaleAgent } from "@/stores/usePresaleAgent";

interface AgentSignatureBlockProps {
  /** Override the signature HTML (e.g. for a different agent). Falls back to logged-in agent. */
  html?: string;
  className?: string;
  /** Show a subtle skeleton while loading. */
  showSkeleton?: boolean;
}

/**
 * Renders the agent's email signature exactly as authored in
 * Presale Properties. Sanitized with DOMPurify; no styles are added —
 * the signature ships its own inline styling.
 */
export function AgentSignatureBlock({
  html,
  className,
  showSkeleton = true,
}: AgentSignatureBlockProps) {
  const { agent, status } = usePresaleAgent();
  const source = html ?? agent?.signatureHtml;

  if (!source) {
    if (showSkeleton && status === "loading") {
      return (
        <div className={cn("space-y-2", className)}>
          <div className="h-3 w-40 rounded bg-muted animate-pulse" />
          <div className="h-3 w-56 rounded bg-muted animate-pulse" />
          <div className="h-3 w-32 rounded bg-muted animate-pulse" />
        </div>
      );
    }
    return null;
  }

  const clean = DOMPurify.sanitize(source, {
    ADD_ATTR: ["target", "rel", "style"],
    ADD_TAGS: ["style"],
  });

  return (
    <div
      className={cn("agent-signature-block", className)}
      // Signature HTML is sanitized above; required for parity with Presale renders.
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  );
}
