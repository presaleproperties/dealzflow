-- 1) manual_override flag — protects user-edited payout amounts from auto-sync
ALTER TABLE public.payouts
  ADD COLUMN IF NOT EXISTS manual_override boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.payouts.manual_override IS
  'When true, useUpdateDeal auto-sync skips this row so user-entered amounts/dates are preserved.';

-- 2) Transactional deal + payouts update.
-- p_deal_data is a JSON object of deal columns to update.
-- p_payouts is an array of {id, amount?, due_date?} objects.
-- All writes happen in a single transaction (function body) — a payout
-- failure RAISEs and rolls the deal change back.
CREATE OR REPLACE FUNCTION public.update_deal_with_payouts(
  p_deal_id  uuid,
  p_deal_data jsonb,
  p_payouts   jsonb DEFAULT '[]'::jsonb
)
RETURNS public.deals
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_deal     public.deals;
  v_payout   jsonb;
  v_payout_id uuid;
  v_existing public.payouts;
BEGIN
  -- Ownership check — only the deal's user may update it
  SELECT * INTO v_deal FROM public.deals WHERE id = p_deal_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'deal not found: %', p_deal_id USING ERRCODE = 'P0002';
  END IF;
  IF v_deal.user_id <> auth.uid() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- Update the deal in place using jsonb_populate_record so the payload
  -- can carry any subset of mutable columns.
  UPDATE public.deals d
  SET
    client_name           = COALESCE((p_deal_data->>'client_name'), d.client_name),
    deal_type             = COALESCE((p_deal_data->>'deal_type')::public.deal_type, d.deal_type),
    property_type         = COALESCE((p_deal_data->>'property_type')::public.property_type, d.property_type),
    status                = COALESCE((p_deal_data->>'status')::public.deal_status, d.status),
    address               = COALESCE((p_deal_data->>'address'), d.address),
    city                  = COALESCE((p_deal_data->>'city'), d.city),
    project_name          = COALESCE((p_deal_data->>'project_name'), d.project_name),
    pending_date          = COALESCE((p_deal_data->>'pending_date')::date, d.pending_date),
    close_date_est        = COALESCE((p_deal_data->>'close_date_est')::date, d.close_date_est),
    close_date_actual     = COALESCE((p_deal_data->>'close_date_actual')::date, d.close_date_actual),
    advance_date          = COALESCE((p_deal_data->>'advance_date')::date, d.advance_date),
    completion_date       = COALESCE((p_deal_data->>'completion_date')::date, d.completion_date),
    advance_commission    = COALESCE((p_deal_data->>'advance_commission')::numeric, d.advance_commission),
    completion_commission = COALESCE((p_deal_data->>'completion_commission')::numeric, d.completion_commission),
    gross_commission_est  = COALESCE((p_deal_data->>'gross_commission_est')::numeric, d.gross_commission_est),
    net_commission_est    = COALESCE((p_deal_data->>'net_commission_est')::numeric, d.net_commission_est),
    team_member           = COALESCE((p_deal_data->>'team_member'), d.team_member),
    team_member_portion   = COALESCE((p_deal_data->>'team_member_portion')::numeric, d.team_member_portion),
    lead_source           = COALESCE((p_deal_data->>'lead_source'), d.lead_source),
    notes                 = COALESCE((p_deal_data->>'notes'), d.notes),
    updated_at            = now()
  WHERE d.id = p_deal_id
  RETURNING * INTO v_deal;

  -- Apply payout updates one by one. Skip any row flagged manual_override.
  IF jsonb_typeof(p_payouts) = 'array' THEN
    FOR v_payout IN SELECT * FROM jsonb_array_elements(p_payouts)
    LOOP
      v_payout_id := (v_payout->>'id')::uuid;
      IF v_payout_id IS NULL THEN CONTINUE; END IF;

      SELECT * INTO v_existing FROM public.payouts WHERE id = v_payout_id AND deal_id = p_deal_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'payout % not found for deal %', v_payout_id, p_deal_id;
      END IF;
      IF v_existing.manual_override THEN
        CONTINUE;  -- preserve user-edited payout
      END IF;

      UPDATE public.payouts
      SET amount     = COALESCE((v_payout->>'amount')::numeric, amount),
          due_date   = COALESCE((v_payout->>'due_date')::date, due_date),
          updated_at = now()
      WHERE id = v_payout_id;
    END LOOP;
  END IF;

  RETURN v_deal;
END;
$$;

REVOKE ALL ON FUNCTION public.update_deal_with_payouts(uuid, jsonb, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.update_deal_with_payouts(uuid, jsonb, jsonb) TO authenticated;