
-- WhatsApp Templates
CREATE TABLE public.crm_whatsapp_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  body_text text NOT NULL,
  category text NOT NULL DEFAULT 'utility',
  status text NOT NULL DEFAULT 'approved',
  language text NOT NULL DEFAULT 'en',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.crm_whatsapp_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "CRM members can view templates" ON public.crm_whatsapp_templates FOR SELECT TO authenticated USING (is_crm_member(auth.uid()));
CREATE POLICY "CRM admins can insert templates" ON public.crm_whatsapp_templates FOR INSERT TO authenticated WITH CHECK (is_crm_admin(auth.uid()));
CREATE POLICY "CRM admins can update templates" ON public.crm_whatsapp_templates FOR UPDATE TO authenticated USING (is_crm_admin(auth.uid()));
CREATE POLICY "CRM admins can delete templates" ON public.crm_whatsapp_templates FOR DELETE TO authenticated USING (is_crm_admin(auth.uid()));

-- Seed starter templates
INSERT INTO public.crm_whatsapp_templates (name, body_text, category) VALUES
  ('Initial Outreach', 'Hello {{1}}, thank you for your interest in presale properties in the Fraser Valley. I''d love to help you find the perfect home. When''s a good time for a quick 15-minute call?', 'marketing'),
  ('Follow Up', 'Hi {{1}}, just following up on our conversation about {{2}}. Do you have any questions I can help with?', 'utility'),
  ('New Project Alert', 'Hi {{1}}, exciting news! We just got VIP access to a new presale project in {{2}}. Would you like me to send you the details?', 'marketing');

-- WhatsApp Conversations
CREATE TABLE public.crm_whatsapp_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  contact_id uuid NOT NULL REFERENCES public.crm_contacts(id) ON DELETE CASCADE,
  phone_number text NOT NULL,
  last_message_at timestamptz,
  last_message_preview text,
  unread_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.crm_whatsapp_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "CRM members can view conversations" ON public.crm_whatsapp_conversations FOR SELECT TO authenticated USING (is_crm_member(auth.uid()));
CREATE POLICY "CRM agents+ can insert conversations" ON public.crm_whatsapp_conversations FOR INSERT TO authenticated WITH CHECK (is_crm_agent_or_above(auth.uid()));
CREATE POLICY "CRM agents+ can update conversations" ON public.crm_whatsapp_conversations FOR UPDATE TO authenticated USING (is_crm_member(auth.uid())) WITH CHECK (is_crm_agent_or_above(auth.uid()));
CREATE POLICY "CRM admins can delete conversations" ON public.crm_whatsapp_conversations FOR DELETE TO authenticated USING (is_crm_admin(auth.uid()));

CREATE INDEX idx_whatsapp_conv_contact ON public.crm_whatsapp_conversations(contact_id);
CREATE INDEX idx_whatsapp_conv_user ON public.crm_whatsapp_conversations(user_id);

-- WhatsApp Messages
CREATE TABLE public.crm_whatsapp_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.crm_whatsapp_conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  direction text NOT NULL DEFAULT 'outbound',
  message_type text NOT NULL DEFAULT 'text',
  content text,
  template_name text,
  status text NOT NULL DEFAULT 'pending',
  whatsapp_message_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.crm_whatsapp_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "CRM members can view messages" ON public.crm_whatsapp_messages FOR SELECT TO authenticated USING (is_crm_member(auth.uid()));
CREATE POLICY "CRM agents+ can insert messages" ON public.crm_whatsapp_messages FOR INSERT TO authenticated WITH CHECK (is_crm_agent_or_above(auth.uid()));
CREATE POLICY "CRM agents+ can update messages" ON public.crm_whatsapp_messages FOR UPDATE TO authenticated USING (is_crm_member(auth.uid())) WITH CHECK (is_crm_agent_or_above(auth.uid()));
CREATE POLICY "CRM admins can delete messages" ON public.crm_whatsapp_messages FOR DELETE TO authenticated USING (is_crm_admin(auth.uid()));

CREATE INDEX idx_whatsapp_msg_conv ON public.crm_whatsapp_messages(conversation_id);
