
CREATE TABLE public.crm_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.crm_contacts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  content text NOT NULL,
  note_type text NOT NULL DEFAULT 'manual',
  is_pinned boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_crm_notes_contact_id ON public.crm_notes(contact_id);

ALTER TABLE public.crm_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "CRM members can view notes"
  ON public.crm_notes FOR SELECT
  USING (is_crm_member(auth.uid()));

CREATE POLICY "CRM agents can insert notes"
  ON public.crm_notes FOR INSERT
  WITH CHECK (auth.uid() = user_id AND is_crm_agent_or_above(auth.uid()));

CREATE POLICY "Users can update their own notes"
  ON public.crm_notes FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own notes"
  ON public.crm_notes FOR DELETE
  USING (auth.uid() = user_id);

CREATE TRIGGER update_crm_notes_updated_at
  BEFORE UPDATE ON public.crm_notes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
