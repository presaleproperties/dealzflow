import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface NotificationRow {
  id: string;
  user_id: string | null;
  title: string;
  body: string | null;
  type: string | null;
  link_to: string | null;
  is_read: boolean | null;
  created_at: string | null;
}

const TYPE_EMOJI: Record<string, string> = {
  new_lead: "🆕",
  hot_lead: "🔥",
  email: "✉️",
  email_open: "👀",
  email_reply: "↩️",
  sms: "💬",
  whatsapp: "💬",
  call: "📞",
  task: "✅",
  appointment: "📅",
  showing: "🏠",
  deal: "💰",
  mention: "@",
  system: "🔔",
};

/**
 * App-wide subscriber that pops a top-right toast whenever a new
 * crm_notifications row arrives for the signed-in user, and refreshes
 * the right-rail bell badge + feed.
 *
 * Mounted once in App.NativeBootstrap. No UI of its own.
 */
export function useLiveNotificationToasts() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const seenIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`live-notifs-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "crm_notifications",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const row = payload.new as NotificationRow;
          if (!row?.id || row.is_read) return;
          if (seenIds.current.has(row.id)) return;
          seenIds.current.add(row.id);

          // Bump badge + feed immediately
          qc.invalidateQueries({ queryKey: ["right-rail", "notif-unread"] });
          qc.invalidateQueries({ queryKey: ["right-rail", "notifications-feed"] });

          const emoji = (row.type && TYPE_EMOJI[row.type]) || "🔔";
          const title = `${emoji}  ${row.title}`;

          toast(title, {
            description: row.body ?? undefined,
            duration: 7000,
            action: row.link_to
              ? {
                  label: "Open",
                  onClick: () => {
                    if (row.link_to) window.location.href = row.link_to;
                  },
                }
              : undefined,
            onDismiss: () => {
              // Silent mark-as-read on dismiss is opt-in; leave unread so the
              // bell badge still reflects "needs attention" until user opens it.
            },
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, qc]);
}
