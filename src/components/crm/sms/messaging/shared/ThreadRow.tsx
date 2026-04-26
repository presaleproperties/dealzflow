import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
  Pin, PinOff, BellOff, Bell, Mail, Archive, ArchiveRestore, Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { initialsFor, nameFor, formatThreadTime, type Thread } from './types';

interface Props {
  thread: Thread;
  active: boolean;
  pinned: boolean;
  muted: boolean;
  archived: boolean;
  onClick: () => void;
  onTogglePin: () => void;
  onToggleMute: () => void;
  onToggleArchive: () => void;
  onMarkUnread: () => void;
  onDelete: () => void;
}

export function ThreadRow({
  thread, active, pinned, muted, archived, onClick, onTogglePin,
  onToggleMute, onToggleArchive, onMarkUnread, onDelete,
}: Props) {
  const last = thread.lastMessage;
  const lastDate = new Date(last.sent_at);
  const preview = last.direction === 'outbound' ? `You: ${last.body}` : last.body;
  const isWa = thread.channel === 'whatsapp';

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <button
          onClick={onClick}
          className={cn(
            'group relative w-full text-left px-2.5 py-2.5 rounded-xl flex gap-2.5 transition-colors native-press',
            active
              ? isWa ? 'bg-emerald-500/10' : 'bg-primary/10'
              : 'hover:bg-muted/60',
            archived && 'opacity-70',
          )}
        >
          <Avatar className="h-10 w-10 shrink-0">
            <AvatarFallback
              className={cn(
                'text-[11px] font-semibold',
                isWa
                  ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                  : 'bg-primary/15 text-primary',
              )}
            >
              {initialsFor(thread.contact, thread.phone)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2 mb-0.5">
              <div className="flex items-center gap-1 min-w-0">
                {pinned && <Pin className="w-2.5 h-2.5 text-primary shrink-0 fill-primary" />}
                {muted && <BellOff className="w-2.5 h-2.5 text-muted-foreground shrink-0" />}
                <span
                  className={cn(
                    'text-[13.5px] truncate',
                    thread.unread ? 'font-semibold text-foreground' : 'font-medium text-foreground/90',
                  )}
                >
                  {nameFor(thread.contact, thread.phone)}
                </span>
              </div>
              <span
                className={cn(
                  'text-[10.5px] shrink-0',
                  thread.unread && !muted
                    ? isWa ? 'text-emerald-600 font-semibold' : 'text-primary font-semibold'
                    : 'text-muted-foreground',
                )}
              >
                {formatThreadTime(lastDate)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span
                className={cn(
                  'text-[12px] truncate',
                  thread.unread ? 'text-foreground/80' : 'text-muted-foreground',
                )}
              >
                {preview}
              </span>
              {thread.unread && !muted && (
                <span
                  className={cn(
                    'w-2 h-2 rounded-full shrink-0',
                    isWa ? 'bg-emerald-500' : 'bg-primary',
                  )}
                />
              )}
            </div>
          </div>

          <span
            role="button"
            tabIndex={-1}
            onClick={(e) => { e.stopPropagation(); onTogglePin(); }}
            className={cn(
              'absolute top-1.5 right-1.5 h-6 w-6 rounded-full flex items-center justify-center transition-opacity',
              'hover:bg-background/80 text-muted-foreground hover:text-primary opacity-0 group-hover:opacity-100',
            )}
            title={pinned ? 'Unpin' : 'Pin'}
          >
            {pinned ? <PinOff className="w-3 h-3" /> : <Pin className="w-3 h-3" />}
          </span>
        </button>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-52">
        <ContextMenuItem onClick={onTogglePin} className="gap-2">
          {pinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
          {pinned ? 'Unpin conversation' : 'Pin conversation'}
        </ContextMenuItem>
        <ContextMenuItem onClick={onMarkUnread} className="gap-2">
          <Mail className="w-3.5 h-3.5" /> Mark as unread
        </ContextMenuItem>
        <ContextMenuItem onClick={onToggleMute} className="gap-2">
          {muted ? <Bell className="w-3.5 h-3.5" /> : <BellOff className="w-3.5 h-3.5" />}
          {muted ? 'Unmute' : 'Mute notifications'}
        </ContextMenuItem>
        <ContextMenuItem onClick={onToggleArchive} className="gap-2">
          {archived ? <ArchiveRestore className="w-3.5 h-3.5" /> : <Archive className="w-3.5 h-3.5" />}
          {archived ? 'Unarchive' : 'Archive conversation'}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={onDelete} className="gap-2 text-destructive focus:text-destructive">
          <Trash2 className="w-3.5 h-3.5" /> Delete conversation
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
