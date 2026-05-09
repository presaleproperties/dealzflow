-- =====================================================================
-- 1. normalize_phone() helper
-- =====================================================================
CREATE OR REPLACE FUNCTION public.normalize_phone(p_raw text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  digits text;
BEGIN
  IF p_raw IS NULL OR btrim(p_raw) = '' THEN
    RETURN NULL;
  END IF;

  digits := regexp_replace(p_raw, '\D', '', 'g');

  IF digits IS NULL OR length(digits) = 0 THEN
    RETURN btrim(p_raw);  -- nothing usable, keep original trimmed
  END IF;

  -- Already E.164-ish: starts with + and 10–15 digits
  IF p_raw ~ '^\+' AND length(digits) BETWEEN 10 AND 15 THEN
    RETURN '+' || digits;
  END IF;

  -- 11 digits starting with 1 → North American
  IF length(digits) = 11 AND left(digits, 1) = '1' THEN
    RETURN '+' || digits;
  END IF;

  -- 10 digits → assume Canada/US
  IF length(digits) = 10 THEN
    RETURN '+1' || digits;
  END IF;

  -- Anything else: keep best-effort (return digits prefixed with + if 8–15)
  IF length(digits) BETWEEN 8 AND 15 THEN
    RETURN '+' || digits;
  END IF;

  RETURN btrim(p_raw);
END;
$$;

-- =====================================================================
-- 2. crm_contacts BEFORE INSERT/UPDATE trigger
-- =====================================================================
CREATE OR REPLACE FUNCTION public.tg_crm_contacts_normalize()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.email IS NOT NULL THEN
    NEW.email := lower(btrim(NEW.email));
    IF NEW.email = '' THEN NEW.email := NULL; END IF;
  END IF;
  IF NEW.email_secondary IS NOT NULL THEN
    NEW.email_secondary := lower(btrim(NEW.email_secondary));
    IF NEW.email_secondary = '' THEN NEW.email_secondary := NULL; END IF;
  END IF;
  IF NEW.co_buyer_email IS NOT NULL THEN
    NEW.co_buyer_email := lower(btrim(NEW.co_buyer_email));
    IF NEW.co_buyer_email = '' THEN NEW.co_buyer_email := NULL; END IF;
  END IF;

  NEW.phone           := public.normalize_phone(NEW.phone);
  NEW.phone_secondary := public.normalize_phone(NEW.phone_secondary);
  NEW.co_buyer_phone  := public.normalize_phone(NEW.co_buyer_phone);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_crm_contacts_normalize ON public.crm_contacts;
CREATE TRIGGER trg_crm_contacts_normalize
  BEFORE INSERT OR UPDATE OF email, email_secondary, co_buyer_email,
                              phone, phone_secondary, co_buyer_phone
  ON public.crm_contacts
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_crm_contacts_normalize();

-- =====================================================================
-- 3. crm_sms_log BEFORE INSERT/UPDATE trigger
-- =====================================================================
CREATE OR REPLACE FUNCTION public.tg_crm_sms_log_normalize()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.to_number   := public.normalize_phone(NEW.to_number);
  NEW.from_number := public.normalize_phone(NEW.from_number);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_crm_sms_log_normalize ON public.crm_sms_log;
CREATE TRIGGER trg_crm_sms_log_normalize
  BEFORE INSERT OR UPDATE OF to_number, from_number
  ON public.crm_sms_log
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_crm_sms_log_normalize();

-- =====================================================================
-- 4. Backfill (safe: catch unique-violation if any)
-- =====================================================================
DO $$
BEGIN
  -- Lowercase emails on existing contacts
  BEGIN
    UPDATE public.crm_contacts
       SET email = lower(btrim(email))
     WHERE email IS NOT NULL AND email <> lower(btrim(email));
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'Skipped some email lowercase updates due to unique_violation';
  END;

  BEGIN
    UPDATE public.crm_contacts
       SET email_secondary = lower(btrim(email_secondary))
     WHERE email_secondary IS NOT NULL AND email_secondary <> lower(btrim(email_secondary));
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  BEGIN
    UPDATE public.crm_contacts
       SET co_buyer_email = lower(btrim(co_buyer_email))
     WHERE co_buyer_email IS NOT NULL AND co_buyer_email <> lower(btrim(co_buyer_email));
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  -- Normalize phones on existing contacts
  BEGIN
    UPDATE public.crm_contacts
       SET phone = public.normalize_phone(phone)
     WHERE phone IS NOT NULL AND phone IS DISTINCT FROM public.normalize_phone(phone);
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  BEGIN
    UPDATE public.crm_contacts
       SET phone_secondary = public.normalize_phone(phone_secondary)
     WHERE phone_secondary IS NOT NULL AND phone_secondary IS DISTINCT FROM public.normalize_phone(phone_secondary);
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  BEGIN
    UPDATE public.crm_contacts
       SET co_buyer_phone = public.normalize_phone(co_buyer_phone)
     WHERE co_buyer_phone IS NOT NULL AND co_buyer_phone IS DISTINCT FROM public.normalize_phone(co_buyer_phone);
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  -- Normalize SMS log numbers
  UPDATE public.crm_sms_log
     SET to_number   = public.normalize_phone(to_number),
         from_number = public.normalize_phone(from_number)
   WHERE to_number   IS DISTINCT FROM public.normalize_phone(to_number)
      OR from_number IS DISTINCT FROM public.normalize_phone(from_number);
END
$$;

-- =====================================================================
-- 5. Audit table for merges
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.crm_merged_contacts (
  id              uuid primary key default gen_random_uuid(),
  winner_id       uuid not null references public.crm_contacts(id) on delete cascade,
  loser_id        uuid not null,                     -- raw uuid, contact is gone
  loser_snapshot  jsonb not null,
  field_choices   jsonb not null default '{}'::jsonb,
  merged_by       uuid,
  merged_at       timestamptz not null default now()
);

CREATE INDEX IF NOT EXISTS idx_crm_merged_contacts_winner ON public.crm_merged_contacts(winner_id);
CREATE INDEX IF NOT EXISTS idx_crm_merged_contacts_at     ON public.crm_merged_contacts(merged_at DESC);

ALTER TABLE public.crm_merged_contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS crm_merged_contacts_select_admin ON public.crm_merged_contacts;
CREATE POLICY crm_merged_contacts_select_admin
  ON public.crm_merged_contacts
  FOR SELECT
  TO authenticated
  USING (public.is_crm_admin(auth.uid())
         OR public.crm_can_see_contact_id(auth.uid(), winner_id));

-- No direct insert/update/delete; only the SECURITY DEFINER RPC writes here.

-- =====================================================================
-- 6. crm_merge_contacts() RPC
-- =====================================================================
CREATE OR REPLACE FUNCTION public.crm_merge_contacts(
  p_winner_id     uuid,
  p_loser_id      uuid,
  p_field_choices jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller    uuid := auth.uid();
  v_is_admin  boolean := public.is_crm_admin(v_caller);
  v_can_w     boolean;
  v_can_l     boolean;
  v_winner    public.crm_contacts%ROWTYPE;
  v_loser     public.crm_contacts%ROWTYPE;
  v_loser_snap jsonb;
  v_merged_tags text[];
  v_merge_note text;
  v_choice_key text;
  v_choice_val text;
  v_col text;
BEGIN
  IF p_winner_id IS NULL OR p_loser_id IS NULL OR p_winner_id = p_loser_id THEN
    RAISE EXCEPTION 'Winner and loser must be distinct contacts';
  END IF;

  SELECT * INTO v_winner FROM public.crm_contacts WHERE id = p_winner_id;
  SELECT * INTO v_loser  FROM public.crm_contacts WHERE id = p_loser_id;
  IF v_winner.id IS NULL OR v_loser.id IS NULL THEN
    RAISE EXCEPTION 'Contact not found';
  END IF;

  v_can_w := public.crm_can_see_contact_id(v_caller, p_winner_id);
  v_can_l := public.crm_can_see_contact_id(v_caller, p_loser_id);
  IF NOT (v_is_admin OR (v_can_w AND v_can_l)) THEN
    RAISE EXCEPTION 'Not allowed to merge these contacts';
  END IF;

  -- Snapshot the loser before anything is mutated
  v_loser_snap := to_jsonb(v_loser);

  -- Apply per-field choices: 'winner' (default), 'loser', or explicit value
  -- p_field_choices is { "<column_name>": "winner" | "loser" }
  IF p_field_choices IS NOT NULL THEN
    FOR v_choice_key, v_choice_val IN
      SELECT key, value::text FROM jsonb_each_text(p_field_choices)
    LOOP
      v_col := v_choice_key;
      -- Whitelist of mergeable columns to prevent SQL injection of arbitrary cols
      IF v_col NOT IN (
        'first_name','last_name','email','email_secondary','co_buyer_email',
        'phone','phone_secondary','co_buyer_phone',
        'address','city','province','postal_code',
        'source','status','assigned_to','contact_type','lead_type',
        'budget_min','budget_max','bedrooms_preferred','language',
        'notes','co_buyer_name','co_buyer_birthday','birthday',
        'project','campaign_source','property_type_pref','referral_source',
        'city_pref','intent','timeframe','home_type_pref',
        'pipeline_segment_id','presale_user_id','lofty_id'
      ) THEN
        CONTINUE;
      END IF;

      IF v_choice_val = 'loser' THEN
        EXECUTE format(
          'UPDATE public.crm_contacts SET %I = (SELECT %I FROM public.crm_contacts WHERE id = $1) WHERE id = $2',
          v_col, v_col
        ) USING p_loser_id, p_winner_id;
      END IF;
    END LOOP;
  END IF;

  -- Always union tags + projects + lead_types + looking_to_buy_in
  v_merged_tags := (
    SELECT array_agg(DISTINCT t)
    FROM unnest(COALESCE(v_winner.tags,'{}') || COALESCE(v_loser.tags,'{}')) t
    WHERE t IS NOT NULL AND btrim(t) <> ''
  );

  UPDATE public.crm_contacts
     SET tags             = COALESCE(v_merged_tags, '{}'),
         projects         = (SELECT array_agg(DISTINCT p) FROM unnest(COALESCE(v_winner.projects,'{}') || COALESCE(v_loser.projects,'{}')) p WHERE p IS NOT NULL AND btrim(p) <> ''),
         lead_types       = (SELECT array_agg(DISTINCT l) FROM unnest(COALESCE(v_winner.lead_types,'{}') || COALESCE(v_loser.lead_types,'{}')) l WHERE l IS NOT NULL AND btrim(l) <> ''),
         looking_to_buy_in= (SELECT array_agg(DISTINCT c) FROM unnest(COALESCE(v_winner.looking_to_buy_in,'{}') || COALESCE(v_loser.looking_to_buy_in,'{}')) c WHERE c IS NOT NULL AND btrim(c) <> '')
   WHERE id = p_winner_id;

  -- Reassign every FK that points at contact_id
  PERFORM set_config('app.skip_touch','on', true); -- don't bump last_touch_at

  UPDATE public.crm_activity_events           SET contact_id = p_winner_id WHERE contact_id = p_loser_id;
  UPDATE public.crm_automation_enrollments    SET contact_id = p_winner_id WHERE contact_id = p_loser_id;
  UPDATE public.crm_automation_logs           SET contact_id = p_winner_id WHERE contact_id = p_loser_id;
  UPDATE public.crm_automation_run_log        SET contact_id = p_winner_id WHERE contact_id = p_loser_id;
  UPDATE public.crm_conversations             SET contact_id = p_winner_id WHERE contact_id = p_loser_id;
  UPDATE public.crm_email_log                 SET contact_id = p_winner_id WHERE contact_id = p_loser_id;
  UPDATE public.crm_email_schedule            SET contact_id = p_winner_id WHERE contact_id = p_loser_id;
  UPDATE public.crm_email_send_log            SET contact_id = p_winner_id WHERE contact_id = p_loser_id;
  UPDATE public.crm_email_threads             SET contact_id = p_winner_id WHERE contact_id = p_loser_id;
  UPDATE public.crm_gmail_messages            SET contact_id = p_winner_id WHERE contact_id = p_loser_id;
  UPDATE public.crm_lead_behavior_engagement  SET contact_id = p_winner_id WHERE contact_id = p_loser_id;
  UPDATE public.crm_lead_behavior_forms       SET contact_id = p_winner_id WHERE contact_id = p_loser_id;
  UPDATE public.crm_lead_behavior_sessions    SET contact_id = p_winner_id WHERE contact_id = p_loser_id;
  UPDATE public.crm_lead_behavior_views       SET contact_id = p_winner_id WHERE contact_id = p_loser_id;
  UPDATE public.crm_messages                  SET contact_id = p_winner_id WHERE contact_id = p_loser_id;
  UPDATE public.crm_notes                     SET contact_id = p_winner_id WHERE contact_id = p_loser_id;
  UPDATE public.crm_scheduler_bookings        SET contact_id = p_winner_id WHERE contact_id = p_loser_id;
  UPDATE public.crm_showings                  SET contact_id = p_winner_id WHERE contact_id = p_loser_id;
  UPDATE public.crm_sms_campaign_recipients   SET contact_id = p_winner_id WHERE contact_id = p_loser_id;
  UPDATE public.crm_sms_log                   SET contact_id = p_winner_id WHERE contact_id = p_loser_id;
  UPDATE public.crm_sms_opt_outs              SET contact_id = p_winner_id WHERE contact_id = p_loser_id;
  UPDATE public.crm_source_events             SET contact_id = p_winner_id WHERE contact_id = p_loser_id;
  UPDATE public.crm_tasks                     SET contact_id = p_winner_id WHERE contact_id = p_loser_id;
  UPDATE public.crm_timeline_link_clicks      SET contact_id = p_winner_id WHERE contact_id = p_loser_id;
  UPDATE public.crm_timeline_pins             SET contact_id = p_winner_id WHERE contact_id = p_loser_id;
  UPDATE public.crm_whatsapp_conversations    SET contact_id = p_winner_id WHERE contact_id = p_loser_id;

  -- Write a "Merged from …" note on the winner
  v_merge_note := format(
    'Merged from %s%s%s on %s',
    COALESCE(NULLIF(btrim(v_loser.first_name || ' ' || v_loser.last_name), ''), 'unnamed contact'),
    CASE WHEN v_loser.email IS NOT NULL THEN ' (' || v_loser.email || ')' ELSE '' END,
    CASE WHEN v_loser.phone IS NOT NULL THEN ' [' || v_loser.phone || ']' ELSE '' END,
    to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI UTC')
  );

  INSERT INTO public.crm_notes (contact_id, content, note_type, created_at)
  VALUES (p_winner_id, v_merge_note, 'system', now());

  -- Snapshot the merge in audit table
  INSERT INTO public.crm_merged_contacts
    (winner_id, loser_id, loser_snapshot, field_choices, merged_by)
  VALUES (p_winner_id, p_loser_id, v_loser_snap, COALESCE(p_field_choices,'{}'::jsonb), v_caller);

  -- Finally, delete the loser contact
  DELETE FROM public.crm_contacts WHERE id = p_loser_id;

  PERFORM set_config('app.skip_touch','off', true);

  RETURN jsonb_build_object(
    'winner_id', p_winner_id,
    'loser_id',  p_loser_id,
    'merged_at', now()
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.crm_merge_contacts(uuid,uuid,jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.crm_merge_contacts(uuid,uuid,jsonb) TO authenticated;