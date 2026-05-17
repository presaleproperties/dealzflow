/**
 * Engagement event log — fire-and-forget client helper.
 *
 * Every meaningful contact touchpoint (email, sms, whatsapp, call, stage
 * change, tag change, note, task, booking, lifecycle, zara handoff) flows
 * through `logEngagementEvent` / `logEngagementEvents`. The helper resolves
 * the calling user's profile id once and appends rows to
 * `public.crm_engagement_events`.
 *
 * **Send paths must never be blocked by a failure here.** All bodies are
 * wrapped in try/catch and errors are downgraded to `console.warn`.
 */
import { supabase } from '@/integrations/supabase/client';

export type EngagementEventType =
  | 'email_sent'
  | 'email_delivered'
  | 'email_opened'
  | 'email_clicked'
  | 'email_bounced'
  | 'email_replied'
  | 'sms_sent'
  | 'sms_delivered'
  | 'sms_failed'
  | 'sms_replied'
  | 'whatsapp_sent'
  | 'whatsapp_delivered'
  | 'whatsapp_read'
  | 'whatsapp_replied'
  | 'call_made'
  | 'call_received'
  | 'call_missed'
  | 'call_voicemail'
  | 'stage_changed'
  | 'tag_added'
  | 'tag_removed'
  | 'note_added'
  | 'task_added'
  | 'task_completed'
  | 'booking_created'
  | 'booking_attended'
  | 'booking_no_show'
  | 'lead_created'
  | 'lead_assigned'
  | 'lead_reassigned'
  | 'zara_handoff'
  | 'zara_response_sent';

export type EngagementSource =
  | 'email'
  | 'sms'
  | 'whatsapp'
  | 'call'
  | 'crm'
  | 'scheduler'
  | 'webhook'
  | 'zara'
  | 'system';

export type EngagementDirection = 'inbound' | 'outbound';

export interface EngagementEventInput {
  contactId: string;
  eventType: EngagementEventType;
  source: EngagementSource;
  direction?: EngagementDirection;
  campaignId?: string | null;
  threadId?: string | null;
  metadata?: Record<string, unknown>;
  occurredAt?: string | Date;
  /** Override actor — defaults to the calling user. Pass `null` for system events. */
  actorId?: string | null;
}

// Cache the actor profile id so we don't hit auth.getUser on every send.
let cachedActorId: string | null | undefined;
let cachedActorPromise: Promise<string | null> | null = null;

async function resolveActorId(): Promise<string | null> {
  if (cachedActorId !== undefined) return cachedActorId ?? null;
  if (cachedActorPromise) return cachedActorPromise;
  cachedActorPromise = (async () => {
    try {
      const { data } = await supabase.auth.getUser();
      const userId = data.user?.id ?? null;
      if (!userId) {
        cachedActorId = null;
        return null;
      }
      // profiles.id may differ from user_id — look it up.
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('user_id', userId)
        .maybeSingle();
      cachedActorId = profile?.id ?? null;
      return cachedActorId;
    } catch {
      cachedActorId = null;
      return null;
    } finally {
      cachedActorPromise = null;
    }
  })();
  return cachedActorPromise;
}

function toRow(input: EngagementEventInput, actorId: string | null) {
  const occurredAt = input.occurredAt
    ? (input.occurredAt instanceof Date ? input.occurredAt.toISOString() : input.occurredAt)
    : new Date().toISOString();
  return {
    contact_id: input.contactId,
    actor_id: input.actorId === undefined ? actorId : input.actorId,
    event_type: input.eventType,
    source: input.source,
    direction: input.direction ?? null,
    campaign_id: input.campaignId ?? null,
    thread_id: input.threadId ?? null,
    metadata: (input.metadata ?? {}) as Record<string, unknown>,
    occurred_at: occurredAt,
  } as never;
}

/** Fire-and-forget: log a single engagement event. Never throws. */
export async function logEngagementEvent(input: EngagementEventInput): Promise<void> {
  try {
    if (!input?.contactId) return;
    const actorId = await resolveActorId();
    const { error } = await supabase
      .from('crm_engagement_events')
      .insert(toRow(input, actorId));
    if (error) console.warn('[engagementLog] insert failed', error.message);
  } catch (err) {
    console.warn('[engagementLog] threw', err);
  }
}

/** Fire-and-forget: log a batch of events in one round trip. Never throws. */
export async function logEngagementEvents(events: EngagementEventInput[]): Promise<void> {
  try {
    const rows = (events ?? []).filter((e) => e?.contactId);
    if (!rows.length) return;
    const actorId = await resolveActorId();
    const { error } = await supabase
      .from('crm_engagement_events')
      .insert(rows.map((r) => toRow(r, actorId)));
    if (error) console.warn('[engagementLog] bulk insert failed', error.message);
  } catch (err) {
    console.warn('[engagementLog] bulk threw', err);
  }
}

/** Test hook — clears the cached actor id so a sign-out/in is picked up. */
export function _resetEngagementActorCache() {
  cachedActorId = undefined;
  cachedActorPromise = null;
}
