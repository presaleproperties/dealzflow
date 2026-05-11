// usePresaleSignatureAutoImport
// ---------------------------------------------------------------------------
// When an agent's identity has been synced from Presale (see
// `usePresaleAgent` + `presale-agent-me` edge fn) AND the agent has not yet
// saved any signature in their CRM workspace, this hook seeds their default
// signature from the synced Presale identity. It also fills in
// `sender_name` / `reply_to` / `brand_logo_url` on `crm_email_settings` if
// those are blank — so every email (single send AND mass send via
// `crm-mass-send-email`, which only accepts a `signature_id`) goes out with
// the agent's branded signature instead of falling back to a bare email.
//
// Idempotent. Runs once per session per user, only when the gap exists.
// Never overwrites anything the agent has already configured manually.

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { usePresaleAgent } from '@/stores/usePresaleAgent';
import { useEmailSignatures } from './useEmailSignatures';
import { useEmailSettings } from './useEmailSettings';
import { buildPresaleReplySignature } from '@/lib/presaleSignatures';

export function usePresaleSignatureAutoImport() {
  const { agent, status } = usePresaleAgent();
  const { data: signatures, isLoading: sigsLoading } = useEmailSignatures();
  const { data: settings, isLoading: settingsLoading } = useEmailSettings();
  const qc = useQueryClient();
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    if (status !== 'ready' || !agent) return;
    if (sigsLoading || settingsLoading) return;

    const existingSettingsSignature = settings?.signature_html?.trim() || '';
    const hasSignatureToImport = !!agent.signatureHtml?.trim();
    const hasNoSavedSignatures = (signatures?.length ?? 0) === 0;

    // Settings may exist with blanks — only fill in fields that are empty.
    const settingsNeedsSenderName = !settings?.sender_name && !!agent.name;
    const settingsNeedsReplyTo = !settings?.reply_to && !!agent.email;
    const settingsNeedsLogo = !settings?.brand_logo_url && !!agent.headshotUrl;

    // If the user already has a manually saved legacy/settings signature, use
    // that to seed the signatures table. Never let Presale defaults outrank a
    // saved CRM signature just because the newer signatures table is empty.
    const shouldBackfillSignatureRow = hasNoSavedSignatures && !!existingSettingsSignature;
    const shouldImportSignature = hasNoSavedSignatures && !existingSettingsSignature && hasSignatureToImport;
    const shouldSeedSettings =
      settingsNeedsSenderName || settingsNeedsReplyTo || settingsNeedsLogo;

    if (!shouldBackfillSignatureRow && !shouldImportSignature && !shouldSeedSettings) return;

    ranRef.current = true;

    void (async () => {
      try {
        const { data: sessionRes } = await supabase.auth.getSession();
        const userId = sessionRes?.session?.user?.id;
        if (!userId) {
          ranRef.current = false; // allow retry once session arrives
          return;
        }

        if (shouldBackfillSignatureRow || shouldImportSignature) {
          const row = {
            user_id: userId,
            name: shouldBackfillSignatureRow ? 'Default signature' : 'Presale Properties',
            html: shouldBackfillSignatureRow ? existingSettingsSignature : agent.signatureHtml!,
            is_default: true,
            sort_order: 0,
          };
          const { error } = await (supabase.from('crm_email_signatures' as any) as any)
            .insert(row);
          if (!error) {
            qc.invalidateQueries({ queryKey: ['crm-email-signatures'] });
          }
        }

        if (shouldSeedSettings) {
          const patch: Record<string, unknown> = { user_id: userId };
          if (settingsNeedsSenderName) patch.sender_name = agent.name;
          if (settingsNeedsReplyTo) patch.reply_to = agent.email;
          if (settingsNeedsLogo) patch.brand_logo_url = agent.headshotUrl;
          const { error } = await (supabase.from('crm_email_settings' as any) as any)
            .upsert(patch, { onConflict: 'user_id' });
          if (!error) {
            qc.invalidateQueries({ queryKey: ['crm-email-settings'] });
          }
        }
      } catch {
        // Best-effort. Don't disrupt composer mount if this fails.
        ranRef.current = false;
      }
    })();
  }, [
    status,
    agent,
    signatures,
    settings,
    sigsLoading,
    settingsLoading,
    qc,
  ]);
}
