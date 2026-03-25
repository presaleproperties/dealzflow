
CREATE TABLE public.daily_focus (
  id          UUID      NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID      NOT NULL,
  date        DATE      NOT NULL DEFAULT CURRENT_DATE,
  position    SMALLINT  NOT NULL DEFAULT 1,
  text        TEXT      NOT NULL DEFAULT '',
  completed   BOOLEAN   NOT NULL DEFAULT false,
  created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, date, position)
);

ALTER TABLE public.daily_focus ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own focus items"
  ON public.daily_focus FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own focus items"
  ON public.daily_focus FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own focus items"
  ON public.daily_focus FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own focus items"
  ON public.daily_focus FOR DELETE
  USING (auth.uid() = user_id);

CREATE TRIGGER update_daily_focus_updated_at
  BEFORE UPDATE ON public.daily_focus
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
