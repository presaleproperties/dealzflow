
-- Helper: check if user is an active CRM team member
CREATE OR REPLACE FUNCTION public.is_crm_member(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.crm_team
    WHERE user_id = _user_id AND is_active = true
  )
$$;

-- Helper: check if user is agent or above (not viewer)
CREATE OR REPLACE FUNCTION public.is_crm_agent_or_above(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.crm_team
    WHERE user_id = _user_id AND is_active = true AND role IN ('owner', 'admin', 'agent')
  )
$$;

------------------------------------------------------------
-- crm_contacts
------------------------------------------------------------
CREATE TABLE public.crm_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name text NOT NULL,
  last_name text NOT NULL,
  email text,
  phone text,
  phone_secondary text,
  address text,
  city text,
  province text DEFAULT 'BC',
  postal_code text,
  source text,
  status text DEFAULT 'New Lead',
  project text,
  assigned_to text,
  tags jsonb DEFAULT '[]'::jsonb,
  budget_min numeric,
  budget_max numeric,
  bedrooms_preferred text,
  language text,
  lead_type text,
  lead_score integer DEFAULT 0,
  notes text,
  co_buyer_name text,
  co_buyer_phone text,
  co_buyer_email text,
  last_contact_at timestamptz,
  next_followup_date timestamptz,
  status_changed_at timestamptz,
  lofty_id text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.crm_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "CRM members can view contacts" ON public.crm_contacts FOR SELECT TO authenticated USING (public.is_crm_member(auth.uid()));
CREATE POLICY "CRM agents+ can insert contacts" ON public.crm_contacts FOR INSERT TO authenticated WITH CHECK (public.is_crm_agent_or_above(auth.uid()));
CREATE POLICY "CRM agents+ can update contacts" ON public.crm_contacts FOR UPDATE TO authenticated USING (public.is_crm_member(auth.uid())) WITH CHECK (public.is_crm_agent_or_above(auth.uid()));
CREATE POLICY "CRM admins can delete contacts" ON public.crm_contacts FOR DELETE TO authenticated USING (public.is_crm_admin(auth.uid()));

------------------------------------------------------------
-- crm_conversations
------------------------------------------------------------
CREATE TABLE public.crm_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.crm_contacts(id) ON DELETE CASCADE,
  channel text NOT NULL,
  status text DEFAULT 'open',
  assigned_agent text,
  last_message_at timestamptz,
  unread_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.crm_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "CRM members can view conversations" ON public.crm_conversations FOR SELECT TO authenticated USING (public.is_crm_member(auth.uid()));
CREATE POLICY "CRM agents+ can insert conversations" ON public.crm_conversations FOR INSERT TO authenticated WITH CHECK (public.is_crm_agent_or_above(auth.uid()));
CREATE POLICY "CRM agents+ can update conversations" ON public.crm_conversations FOR UPDATE TO authenticated USING (public.is_crm_member(auth.uid())) WITH CHECK (public.is_crm_agent_or_above(auth.uid()));
CREATE POLICY "CRM admins can delete conversations" ON public.crm_conversations FOR DELETE TO authenticated USING (public.is_crm_admin(auth.uid()));

------------------------------------------------------------
-- crm_messages
------------------------------------------------------------
CREATE TABLE public.crm_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.crm_conversations(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.crm_contacts(id),
  direction text NOT NULL,
  content text,
  message_type text DEFAULT 'text',
  channel text,
  read boolean DEFAULT false,
  delivered boolean DEFAULT false,
  sent_by text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.crm_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "CRM members can view messages" ON public.crm_messages FOR SELECT TO authenticated USING (public.is_crm_member(auth.uid()));
CREATE POLICY "CRM agents+ can insert messages" ON public.crm_messages FOR INSERT TO authenticated WITH CHECK (public.is_crm_agent_or_above(auth.uid()));
CREATE POLICY "CRM agents+ can update messages" ON public.crm_messages FOR UPDATE TO authenticated USING (public.is_crm_member(auth.uid())) WITH CHECK (public.is_crm_agent_or_above(auth.uid()));
CREATE POLICY "CRM admins can delete messages" ON public.crm_messages FOR DELETE TO authenticated USING (public.is_crm_admin(auth.uid()));

------------------------------------------------------------
-- crm_email_campaigns
------------------------------------------------------------
CREATE TABLE public.crm_email_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject text NOT NULL,
  body_html text,
  recipients_count integer DEFAULT 0,
  sent_at timestamptz,
  status text DEFAULT 'draft',
  opens integer DEFAULT 0,
  clicks integer DEFAULT 0,
  segment_filter jsonb,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.crm_email_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "CRM members can view campaigns" ON public.crm_email_campaigns FOR SELECT TO authenticated USING (public.is_crm_member(auth.uid()));
CREATE POLICY "CRM agents+ can insert campaigns" ON public.crm_email_campaigns FOR INSERT TO authenticated WITH CHECK (public.is_crm_agent_or_above(auth.uid()));
CREATE POLICY "CRM agents+ can update campaigns" ON public.crm_email_campaigns FOR UPDATE TO authenticated USING (public.is_crm_member(auth.uid())) WITH CHECK (public.is_crm_agent_or_above(auth.uid()));
CREATE POLICY "CRM admins can delete campaigns" ON public.crm_email_campaigns FOR DELETE TO authenticated USING (public.is_crm_admin(auth.uid()));

------------------------------------------------------------
-- crm_email_templates
------------------------------------------------------------
CREATE TABLE public.crm_email_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  subject text NOT NULL,
  body_html text,
  project text,
  times_used integer DEFAULT 0,
  last_used_at timestamptz,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.crm_email_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "CRM members can view templates" ON public.crm_email_templates FOR SELECT TO authenticated USING (public.is_crm_member(auth.uid()));
CREATE POLICY "CRM agents+ can insert templates" ON public.crm_email_templates FOR INSERT TO authenticated WITH CHECK (public.is_crm_agent_or_above(auth.uid()));
CREATE POLICY "CRM agents+ can update templates" ON public.crm_email_templates FOR UPDATE TO authenticated USING (public.is_crm_member(auth.uid())) WITH CHECK (public.is_crm_agent_or_above(auth.uid()));
CREATE POLICY "CRM admins can delete templates" ON public.crm_email_templates FOR DELETE TO authenticated USING (public.is_crm_admin(auth.uid()));

------------------------------------------------------------
-- crm_showings
------------------------------------------------------------
CREATE TABLE public.crm_showings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.crm_contacts(id) ON DELETE CASCADE,
  project text NOT NULL,
  unit text,
  showing_date date NOT NULL,
  showing_time time NOT NULL,
  assigned_agent text,
  status text DEFAULT 'confirmed',
  notes text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.crm_showings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "CRM members can view showings" ON public.crm_showings FOR SELECT TO authenticated USING (public.is_crm_member(auth.uid()));
CREATE POLICY "CRM agents+ can insert showings" ON public.crm_showings FOR INSERT TO authenticated WITH CHECK (public.is_crm_agent_or_above(auth.uid()));
CREATE POLICY "CRM agents+ can update showings" ON public.crm_showings FOR UPDATE TO authenticated USING (public.is_crm_member(auth.uid())) WITH CHECK (public.is_crm_agent_or_above(auth.uid()));
CREATE POLICY "CRM admins can delete showings" ON public.crm_showings FOR DELETE TO authenticated USING (public.is_crm_admin(auth.uid()));

------------------------------------------------------------
-- crm_automations
------------------------------------------------------------
CREATE TABLE public.crm_automations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  trigger_type text NOT NULL,
  trigger_config jsonb,
  is_active boolean DEFAULT true,
  total_enrolled integer DEFAULT 0,
  total_converted integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.crm_automations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "CRM members can view automations" ON public.crm_automations FOR SELECT TO authenticated USING (public.is_crm_member(auth.uid()));
CREATE POLICY "CRM admins can insert automations" ON public.crm_automations FOR INSERT TO authenticated WITH CHECK (public.is_crm_admin(auth.uid()));
CREATE POLICY "CRM admins can update automations" ON public.crm_automations FOR UPDATE TO authenticated USING (public.is_crm_admin(auth.uid()));
CREATE POLICY "CRM admins can delete automations" ON public.crm_automations FOR DELETE TO authenticated USING (public.is_crm_admin(auth.uid()));

------------------------------------------------------------
-- crm_automation_steps
------------------------------------------------------------
CREATE TABLE public.crm_automation_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id uuid NOT NULL REFERENCES public.crm_automations(id) ON DELETE CASCADE,
  step_order integer NOT NULL,
  action_type text NOT NULL,
  action_config jsonb,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.crm_automation_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "CRM members can view automation steps" ON public.crm_automation_steps FOR SELECT TO authenticated USING (public.is_crm_member(auth.uid()));
CREATE POLICY "CRM admins can insert automation steps" ON public.crm_automation_steps FOR INSERT TO authenticated WITH CHECK (public.is_crm_admin(auth.uid()));
CREATE POLICY "CRM admins can update automation steps" ON public.crm_automation_steps FOR UPDATE TO authenticated USING (public.is_crm_admin(auth.uid()));
CREATE POLICY "CRM admins can delete automation steps" ON public.crm_automation_steps FOR DELETE TO authenticated USING (public.is_crm_admin(auth.uid()));

------------------------------------------------------------
-- crm_tasks
------------------------------------------------------------
CREATE TABLE public.crm_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid REFERENCES public.crm_contacts(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  due_date timestamptz,
  priority text DEFAULT 'medium',
  status text DEFAULT 'pending',
  assigned_to text,
  task_type text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.crm_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "CRM members can view tasks" ON public.crm_tasks FOR SELECT TO authenticated USING (public.is_crm_member(auth.uid()));
CREATE POLICY "CRM agents+ can insert tasks" ON public.crm_tasks FOR INSERT TO authenticated WITH CHECK (public.is_crm_agent_or_above(auth.uid()));
CREATE POLICY "CRM agents+ can update tasks" ON public.crm_tasks FOR UPDATE TO authenticated USING (public.is_crm_member(auth.uid())) WITH CHECK (public.is_crm_agent_or_above(auth.uid()));
CREATE POLICY "CRM admins can delete tasks" ON public.crm_tasks FOR DELETE TO authenticated USING (public.is_crm_admin(auth.uid()));

------------------------------------------------------------
-- crm_notifications
------------------------------------------------------------
CREATE TABLE public.crm_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id),
  title text NOT NULL,
  body text,
  type text,
  is_read boolean DEFAULT false,
  link_to text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.crm_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "CRM members can view own notifications" ON public.crm_notifications FOR SELECT TO authenticated USING (user_id = auth.uid() AND public.is_crm_member(auth.uid()));
CREATE POLICY "CRM agents+ can insert notifications" ON public.crm_notifications FOR INSERT TO authenticated WITH CHECK (public.is_crm_agent_or_above(auth.uid()));
CREATE POLICY "CRM members can update own notifications" ON public.crm_notifications FOR UPDATE TO authenticated USING (user_id = auth.uid() AND public.is_crm_member(auth.uid()));
CREATE POLICY "CRM admins can delete notifications" ON public.crm_notifications FOR DELETE TO authenticated USING (public.is_crm_admin(auth.uid()));
