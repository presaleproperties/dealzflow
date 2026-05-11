import { useParams } from 'react-router-dom';
import { MessageSquare } from 'lucide-react';
import CrmChatsPage from './CrmChatsPage';
import CrmChatThreadPage from './CrmChatThreadPage';
import CrmNewChatPane from './CrmNewChatPane';
import { LeadContextRail } from '@/components/crm/chats/LeadContextRail';

/**
 * Two-pane chat shell.
 *
 * Tablet+ (md+): left pane = thread list (always visible), right pane = open
 * conversation or empty state. Mirrors a normal email/messenger inbox and
 * makes iPad portrait/landscape feel native instead of a stretched phone.
 *
 * Phone (<md): falls back to the original single-pane behavior — list on
 * `/crm/chats`, full thread on `/crm/chats/:conversationId`. This preserves
 * the mobile UX (back button, swipe, FAB) and keeps the spacing tokens
 * untouched.
 */
export default function CrmChatsShell() {
  const { conversationId } = useParams<{ conversationId?: string }>();
  const isNew = conversationId === 'new';
  const hasThread = !!conversationId && !isNew;

  return (
    <>
      {/* ---------- PHONE (single pane) ---------- */}
      <div className="md:hidden flex flex-1 min-h-0 h-full flex-col">
        {isNew ? <CrmNewChatPane /> : hasThread ? <CrmChatThreadPage /> : <CrmChatsPage />}
      </div>

      {/* ---------- TABLET / DESKTOP (two pane) ---------- */}
      <div className="hidden md:flex flex-1 min-h-0 h-full -mx-4 -my-4">
        {/* Left: list (fixed width) */}
        <aside className="w-[320px] lg:w-[380px] xl:w-[420px] shrink-0 border-r border-border/60 bg-background flex flex-col min-h-0 overflow-hidden">
          <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4">
            <CrmChatsPage />
          </div>
        </aside>

        {/* Right: thread, new-chat composer, or empty state */}
        <section className="flex-1 min-w-0 flex flex-col bg-muted/5">
          {isNew ? (
            <CrmNewChatPane />
          ) : hasThread ? (
            <CrmChatThreadPage embedded />
          ) : (
            <EmptyThreadState />
          )}
        </section>
      </div>
    </>
  );
}

function EmptyThreadState() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/15 to-primary/5 border border-primary/20 flex items-center justify-center mb-4">
        <MessageSquare className="w-7 h-7 text-primary" strokeWidth={1.6} />
      </div>
      <h2 className="text-[16px] font-semibold tracking-tight text-foreground mb-1.5">
        Select a conversation
      </h2>
      <p className="text-[13px] text-muted-foreground max-w-[320px] leading-relaxed">
        Pick a thread from the list to read messages and reply. New replies will appear here in real time.
      </p>
    </div>
  );
}
