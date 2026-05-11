
-- 1. crm_whatsapp_messages: gate by linked conversation's contact visibility
DROP POLICY IF EXISTS "crm_whatsapp_messages_select_own" ON public.crm_whatsapp_messages;
DROP POLICY IF EXISTS "CRM agents+ can insert messages" ON public.crm_whatsapp_messages;
DROP POLICY IF EXISTS "CRM agents+ can update messages" ON public.crm_whatsapp_messages;

CREATE POLICY "crm_whatsapp_messages_select_visible_contact"
ON public.crm_whatsapp_messages
FOR SELECT
USING (
  is_crm_admin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.crm_whatsapp_conversations c
    WHERE c.id = crm_whatsapp_messages.conversation_id
      AND (
        c.contact_id IS NULL
        OR crm_can_see_contact_id(auth.uid(), c.contact_id)
      )
  )
);

CREATE POLICY "crm_whatsapp_messages_insert_visible_contact"
ON public.crm_whatsapp_messages
FOR INSERT
WITH CHECK (
  is_crm_agent_or_above(auth.uid())
  AND (
    is_crm_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.crm_whatsapp_conversations c
      WHERE c.id = crm_whatsapp_messages.conversation_id
        AND (
          c.contact_id IS NULL
          OR crm_can_see_contact_id(auth.uid(), c.contact_id)
        )
    )
  )
);

CREATE POLICY "crm_whatsapp_messages_update_visible_contact"
ON public.crm_whatsapp_messages
FOR UPDATE
USING (
  is_crm_admin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.crm_whatsapp_conversations c
    WHERE c.id = crm_whatsapp_messages.conversation_id
      AND crm_can_see_contact_id(auth.uid(), c.contact_id)
  )
)
WITH CHECK (
  is_crm_agent_or_above(auth.uid())
);

-- 2. crm_email_send_log: tighten INSERT/UPDATE/DELETE to visible contacts only
DROP POLICY IF EXISTS "crm members insert send log" ON public.crm_email_send_log;
DROP POLICY IF EXISTS "crm members update send log" ON public.crm_email_send_log;
DROP POLICY IF EXISTS "crm members delete send log" ON public.crm_email_send_log;

CREATE POLICY "crm_email_send_log_insert_visible_contact"
ON public.crm_email_send_log
FOR INSERT
WITH CHECK (
  is_crm_admin(auth.uid())
  OR (
    is_crm_member(auth.uid())
    AND (
      contact_id IS NULL
      OR crm_can_see_contact_id(auth.uid(), contact_id)
    )
  )
);

CREATE POLICY "crm_email_send_log_update_visible_contact"
ON public.crm_email_send_log
FOR UPDATE
USING (
  is_crm_admin(auth.uid())
  OR ((contact_id IS NOT NULL) AND crm_can_see_contact_id(auth.uid(), contact_id))
)
WITH CHECK (
  is_crm_admin(auth.uid())
  OR (
    is_crm_member(auth.uid())
    AND (contact_id IS NULL OR crm_can_see_contact_id(auth.uid(), contact_id))
  )
);

CREATE POLICY "crm_email_send_log_delete_admin"
ON public.crm_email_send_log
FOR DELETE
USING (is_crm_admin(auth.uid()));

-- 3. crm_contacts: constrain INSERT so non-admin agents can only assign to themselves
DROP POLICY IF EXISTS "CRM agents+ can insert contacts" ON public.crm_contacts;

CREATE POLICY "crm_contacts_insert_assigned_self_or_admin"
ON public.crm_contacts
FOR INSERT
WITH CHECK (
  is_crm_agent_or_above(auth.uid())
  AND (
    is_crm_admin_or_owner(auth.uid())
    OR assigned_to IS NULL
    OR crm_can_see_contact(auth.uid(), assigned_to)
  )
);

-- 4. crm_tasks: allow admins/owners to also see standalone (null contact_id) tasks
DROP POLICY IF EXISTS "crm_tasks_select_scoped" ON public.crm_tasks;

CREATE POLICY "crm_tasks_select_scoped"
ON public.crm_tasks
FOR SELECT
USING (
  is_crm_admin_or_owner(auth.uid())
  OR (contact_id IS NOT NULL AND crm_can_see_contact_id(auth.uid(), contact_id))
);

-- Tighten task UPDATE/DELETE: must reference a visible contact (or admin)
DROP POLICY IF EXISTS "CRM agents+ can update tasks" ON public.crm_tasks;
CREATE POLICY "crm_tasks_update_visible_contact"
ON public.crm_tasks
FOR UPDATE
USING (
  is_crm_admin_or_owner(auth.uid())
  OR (contact_id IS NOT NULL AND crm_can_see_contact_id(auth.uid(), contact_id))
)
WITH CHECK (
  is_crm_agent_or_above(auth.uid())
);
