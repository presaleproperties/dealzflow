-- Enable UUID extension (likely already enabled)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- conversations table
CREATE TABLE IF NOT EXISTS public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  lead_id UUID,
  channel TEXT NOT NULL DEFAULT 'whatsapp' CHECK (channel IN ('whatsapp','sms','email','facebook','instagram','tiktok')),
  external_id TEXT,
  lead_name TEXT NOT NULL DEFAULT 'Unknown',
  lead_phone TEXT,
  lead_email TEXT,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','contacted','engaged','qualified','booked','escalated','unresponsive','disqualified','closed')),
  assigned_to TEXT NOT NULL DEFAULT 'zara' CHECK (assigned_to IN ('zara','uzair')),
  heat INTEGER DEFAULT 0 CHECK (heat >= 0 AND heat <= 100),
  last_message_at TIMESTAMPTZ,
  meta_window_expires_at TIMESTAMPTZ,
  lofty_contact_id TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- messages table
CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('inbound','outbound')),
  sender TEXT NOT NULL CHECK (sender IN ('lead','zara','uzair')),
  body TEXT NOT NULL,
  twilio_message_sid TEXT,
  status TEXT DEFAULT 'sent' CHECK (status IN ('queued','sent','delivered','read','failed')),
  media_url TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- zara_activity table
CREATE TABLE IF NOT EXISTS public.zara_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,
  description TEXT,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- lead_notes table
CREATE TABLE IF NOT EXISTS public.lead_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_by TEXT DEFAULT 'uzair',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS on all tables
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zara_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_notes ENABLE ROW LEVEL SECURITY;

-- RLS policies for conversations
CREATE POLICY "Users can view their own conversations" ON public.conversations FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own conversations" ON public.conversations FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own conversations" ON public.conversations FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own conversations" ON public.conversations FOR DELETE USING (auth.uid() = user_id);

-- RLS policies for messages (via conversation ownership)
CREATE POLICY "Users can view messages in their conversations" ON public.messages FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = messages.conversation_id AND c.user_id = auth.uid())
);
CREATE POLICY "Users can insert messages in their conversations" ON public.messages FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = messages.conversation_id AND c.user_id = auth.uid())
);
CREATE POLICY "Users can update messages in their conversations" ON public.messages FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = messages.conversation_id AND c.user_id = auth.uid())
);
CREATE POLICY "Users can delete messages in their conversations" ON public.messages FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = messages.conversation_id AND c.user_id = auth.uid())
);

-- RLS policies for zara_activity (via conversation ownership)
CREATE POLICY "Users can view zara activity in their conversations" ON public.zara_activity FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = zara_activity.conversation_id AND c.user_id = auth.uid())
);
CREATE POLICY "Users can insert zara activity in their conversations" ON public.zara_activity FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = zara_activity.conversation_id AND c.user_id = auth.uid())
);

-- RLS policies for lead_notes (via conversation ownership)
CREATE POLICY "Users can view notes in their conversations" ON public.lead_notes FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = lead_notes.conversation_id AND c.user_id = auth.uid())
);
CREATE POLICY "Users can insert notes in their conversations" ON public.lead_notes FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = lead_notes.conversation_id AND c.user_id = auth.uid())
);
CREATE POLICY "Users can update notes in their conversations" ON public.lead_notes FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = lead_notes.conversation_id AND c.user_id = auth.uid())
);
CREATE POLICY "Users can delete notes in their conversations" ON public.lead_notes FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = lead_notes.conversation_id AND c.user_id = auth.uid())
);

-- Updated_at trigger for conversations
CREATE OR REPLACE FUNCTION public.update_conversations_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER conversations_updated_at
  BEFORE UPDATE ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.update_conversations_updated_at();

-- Enable Realtime on messages and conversations
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON public.conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_status ON public.conversations(status);
CREATE INDEX IF NOT EXISTS idx_conversations_last_message_at ON public.conversations(last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON public.messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON public.messages(created_at);
CREATE INDEX IF NOT EXISTS idx_lead_notes_conversation_id ON public.lead_notes(conversation_id);
CREATE INDEX IF NOT EXISTS idx_zara_activity_conversation_id ON public.zara_activity(conversation_id);