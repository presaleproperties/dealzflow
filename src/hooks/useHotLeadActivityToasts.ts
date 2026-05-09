import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const HIGH_INTENT = new Set([
  "email_open",
  "deck_unlock",
  "deck_visit",
  "link_click",
  "floorplan_download",
  "form_submission",
  "contact_form",
  "return_visit",
  "lead_returned",
]);

const TYPE_PHRASE: Record<string, string> = {
  email_open: "just opened your email",
  deck_unlock: "just unlocked your pitch deck",
  deck_visit: "is back on your deck",
  link_click: "just clicked a link",
  floorplan_download: "downloaded a floor plan",
  form_submission: "submitted a form",
  contact_form: "submitted a contact form",
  return_visit: "is back on your website",
  lead_returned: "is back on your website",
};

interface ActivityRow {
  id: string;
  type: string;
  contact_id: string | null;
  project_slug: string | null;
  metadata: Record<string, any> | null;
}

/**
 * App-wide subscriber that pops a toast when a high-intent engagement event
 * arrives for a lead assigned to the currently signed-in user.
 *
 * Mounted once in App.tsx alongside other bootstrap hooks. No UI of its own.
 */
export function useHotLeadActivityToasts() {
  const myDisplayNameRef = useRef<string | null>(null);
  const seenIds = useRef<Set<string>>(new Set());

  // Resolve the signed-in user's CRM display name once on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      const uid = u?.user?.id;
      if (!uid) return;
      const { data: member } = await supabase
        .from("crm_team")
        .select("display_name, is_active")
        .eq("user_id", uid)
        .eq("is_active", true)
        .maybeSingle();
      if (!cancelled && member?.display_name) {
        myDisplayNameRef.current = member.display_name;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel("hot-lead-activity-global")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "crm_activity_events",
        },
        async (payload) => {
          const row = payload.new as ActivityRow;
          if (!row?.contact_id) return;
          if (!HIGH_INTENT.has(row.type)) return;
          if (seenIds.current.has(row.id)) return;
          seenIds.current.add(row.id);

          // Look up the contact + assignment to filter to "my" leads
          const { data: contact } = await supabase
            .from("crm_contacts")
            .select("id, first_name, last_name, assigned_to")
            .eq("id", row.contact_id)
            .maybeSingle();
          if (!contact) return;

          const myName = myDisplayNameRef.current;
          if (!myName || (contact.assigned_to ?? "").toLowerCase() !== myName.toLowerCase()) {
            return;
          }

          const fullName =
            [contact.first_name, contact.last_name].filter(Boolean).join(" ") ||
            "A lead";
          const phrase = TYPE_PHRASE[row.type] ?? `triggered ${row.type}`;
          const meta = row.metadata ?? {};
          const projectName = meta.project_name || meta.property_name || row.project_slug;
          const projectPart = projectName ? ` · ${projectName}` : "";
          const visitNum = Number(meta.visit_number ?? 0);
          const visitPart = visitNum ? ` (visit #${visitNum})` : "";

          toast(`🔥 ${fullName} ${phrase}${visitPart}${projectPart}`, {
            action: {
              label: "Open lead",
              onClick: () => {
                window.location.href = `/crm/leads/${contact.id}`;
              },
            },
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);
}
