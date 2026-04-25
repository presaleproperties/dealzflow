-- Allow CRM members to delete their own SMS log entries (for "Delete conversation" feature)
CREATE POLICY "CRM members can delete SMS"
ON public.crm_sms_log
FOR DELETE
TO authenticated
USING (is_crm_member(auth.uid()));