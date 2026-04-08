
-- Add lead_type column to crm_contacts
ALTER TABLE public.crm_contacts ADD COLUMN IF NOT EXISTS lead_type text DEFAULT 'presale';

-- Create saved views table
CREATE TABLE public.crm_saved_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  filters jsonb NOT NULL DEFAULT '{}',
  sort_order integer NOT NULL DEFAULT 0,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.crm_saved_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own saved views" ON public.crm_saved_views FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own saved views" ON public.crm_saved_views FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own saved views" ON public.crm_saved_views FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own saved views" ON public.crm_saved_views FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX idx_saved_views_user ON public.crm_saved_views(user_id);

-- Create lead segments table
CREATE TABLE public.crm_lead_segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid, -- null = shared/default segment
  name text NOT NULL,
  emoji text,
  filter_config jsonb NOT NULL DEFAULT '{}',
  color text NOT NULL DEFAULT '#D4A843',
  sort_order integer NOT NULL DEFAULT 0,
  is_default boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.crm_lead_segments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "CRM members can view segments" ON public.crm_lead_segments FOR SELECT TO authenticated USING (is_crm_member(auth.uid()));
CREATE POLICY "CRM admins can insert segments" ON public.crm_lead_segments FOR INSERT TO authenticated WITH CHECK (is_crm_admin(auth.uid()));
CREATE POLICY "CRM admins can update segments" ON public.crm_lead_segments FOR UPDATE TO authenticated USING (is_crm_admin(auth.uid()));
CREATE POLICY "CRM admins can delete segments" ON public.crm_lead_segments FOR DELETE TO authenticated USING (is_crm_admin(auth.uid()));

-- Seed default segments
INSERT INTO public.crm_lead_segments (name, emoji, filter_config, color, sort_order, is_default) VALUES
  ('All Leads', NULL, '{}', '#D4A843', 0, true),
  ('New Leads', NULL, '{"status": ["New Lead"]}', '#3B82F6', 1, true),
  ('Presale', '🏗️', '{"lead_type": ["presale"]}', '#D4A843', 2, true),
  ('Pre-Sale 🔥', '🔥', '{"status": ["Hot / Engaged","Contacted"], "lead_type": ["presale"]}', '#F97316', 3, true),
  ('Re-Sale 🔥', '🔥', '{"lead_type": ["resale"], "status": ["Hot / Engaged","Contacted"]}', '#F97316', 4, true),
  ('Commercial', '🏢', '{"lead_type": ["commercial"]}', '#8B5CF6', 5, true),
  ('Showing Booked', '🛒', '{"status": ["Showing Booked"]}', '#22C55E', 6, true),
  ('Offer Made', '🔍', '{"status": ["Offer Made"]}', '#14B8A6', 7, true),
  ('Nurturing', '💬', '{"status": ["Nurturing"]}', '#EAB308', 8, true),
  ('Closed', '🔒', '{"status": ["Closed"]}', '#22C55E', 9, true),
  ('Lost / Cold', '❄️', '{"status": ["Lost / Cold"]}', '#6B7280', 10, true);
