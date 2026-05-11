import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { Bold, Italic, List, ListOrdered, Heading2, Link2, Link2Off } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useEffect, useRef, useCallback, type ReactNode } from 'react';

interface Props {
  content: string;
  onChange: (html: string) => void;
  placeholder?: string;
  /** Optional content rendered inside the same bordered container, beneath the editor body. */
  footerSlot?: ReactNode;
  /** Optional extra controls rendered on the right side of the toolbar row. */
  toolbarSlot?: ReactNode;
  /** Max height (px) of the scrollable editor + footer area. Defaults to 460px. */
  maxBodyHeight?: number;
  /**
   * When true (and a `footerSlot` is rendered), aggressively collapse spacing
   * between the body and the signature: zero out the last paragraph's bottom
   * margin AND any trailing empty paragraphs/<br> nodes the user may have left
   * behind, so text always sits flush against the signature.
   */
  flushSignature?: boolean;
}

export function RichTextEditor({
  content,
  onChange,
  placeholder = 'Write your email...',
  footerSlot,
  toolbarSlot,
  maxBodyHeight = 460,
  flushSignature = false,
}: Props) {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const flushClasses = flushSignature && footerSlot
    ? ' [&_p:last-child]:mb-0 [&_p:last-child:empty]:hidden [&>*:last-child]:mb-0'
    : ' [&_p:last-child]:mb-0';

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        link: {
          openOnClick: false,
          autolink: true,
          linkOnPaste: true,
          HTMLAttributes: {
            rel: 'noopener noreferrer nofollow',
            target: '_blank',
            class: 'text-primary underline underline-offset-2 hover:text-primary/80',
          },
        },
      }),
      Placeholder.configure({ placeholder }),
    ],
    content,
    autofocus: 'end',
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      attributes: {
        // When a signature/footer is rendered below, drop the bottom padding
        // and last-paragraph margin so text can sit flush against it.
        class: `prose prose-sm max-w-none min-h-[120px] px-4 pt-4 outline-none text-foreground${flushClasses} ${
          footerSlot ? 'pb-0' : 'pb-4'
        }`,
      },
    },
  });

  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content);
    }
  }, [content]);

  /**
   * Auto-scroll: keep the caret in view inside the bordered box.
   * On every selection change or content edit, measure the caret's screen
   * position and adjust scrollTop so the caret stays comfortably visible
   * with the signature naturally appearing right below.
   */
  useEffect(() => {
    if (!editor) return;
    const ensureCaretVisible = () => {
      const scroller = scrollRef.current;
      if (!scroller) return;
      const sel = editor.state.selection;
      try {
        const coords = editor.view.coordsAtPos(sel.head);
        const sRect = scroller.getBoundingClientRect();
        // Comfort margin: keep caret at least 60px from top, 120px from bottom
        // so the signature peeks into view as the user types near the end.
        const topMargin = 60;
        const bottomMargin = 120;
        if (coords.bottom > sRect.bottom - bottomMargin) {
          scroller.scrollTop += coords.bottom - (sRect.bottom - bottomMargin);
        } else if (coords.top < sRect.top + topMargin) {
          scroller.scrollTop -= (sRect.top + topMargin) - coords.top;
        }
      } catch {
        /* coordsAtPos can throw during transient state; ignore */
      }
    };
    editor.on('selectionUpdate', ensureCaretVisible);
    editor.on('update', ensureCaretVisible);
    return () => {
      editor.off('selectionUpdate', ensureCaretVisible);
      editor.off('update', ensureCaretVisible);
    };
  }, [editor]);

  const handleSetLink = useCallback(() => {
    if (!editor) return;
    const previous = editor.getAttributes('link').href as string | undefined;
    const url = window.prompt('Link URL', previous ?? 'https://');
    if (url === null) return; // cancelled
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    // Basic normalisation: prepend https:// if missing scheme.
    const normalised = /^(https?:|mailto:|tel:)/i.test(url) ? url : `https://${url}`;
    editor.chain().focus().extendMarkRange('link').setLink({ href: normalised }).run();
  }, [editor]);

  if (!editor) return null;

  const btnClass = 'h-8 w-8 p-0';

  return (
    <div className="flex flex-col h-full min-h-0 lg:min-h-[320px] bg-background">
      {/* Toolbar — sits flush against the composer header above (no border-top, no rounded corners) */}
      <div
        className="composer-toolbar flex items-center gap-0.5 px-1 py-1.5 border-b border-border/60 bg-muted/20 overflow-x-auto flex-nowrap"
        style={{ touchAction: 'pan-x', overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch' }}
      >
        <Button type="button" aria-label="Bold" variant={editor.isActive('bold') ? 'secondary' : 'ghost'} size="sm" className={btnClass} onClick={() => editor.chain().focus().toggleBold().run()}>
          <Bold className="w-4 h-4" />
        </Button>
        <Button type="button" aria-label="Italic" variant={editor.isActive('italic') ? 'secondary' : 'ghost'} size="sm" className={btnClass} onClick={() => editor.chain().focus().toggleItalic().run()}>
          <Italic className="w-4 h-4" />
        </Button>
        <Button type="button" aria-label="Heading" variant={editor.isActive('heading') ? 'secondary' : 'ghost'} size="sm" className={btnClass} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
          <Heading2 className="w-4 h-4" />
        </Button>
        <Button type="button" aria-label="Bullet list" variant={editor.isActive('bulletList') ? 'secondary' : 'ghost'} size="sm" className={btnClass} onClick={() => editor.chain().focus().toggleBulletList().run()}>
          <List className="w-4 h-4" />
        </Button>
        <Button type="button" aria-label="Numbered list" variant={editor.isActive('orderedList') ? 'secondary' : 'ghost'} size="sm" className={btnClass} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
          <ListOrdered className="w-4 h-4" />
        </Button>
        <div className="w-px h-5 bg-border/70 mx-1" />
        <Button type="button" aria-label="Insert link" variant={editor.isActive('link') ? 'secondary' : 'ghost'} size="sm" className={btnClass} onClick={handleSetLink} title="Add or edit link">
          <Link2 className="w-4 h-4" />
        </Button>
        {editor.isActive('link') && (
          <Button type="button" aria-label="Remove link" variant="ghost" size="sm" className={btnClass} onClick={() => editor.chain().focus().unsetLink().run()} title="Remove link">
            <Link2Off className="w-4 h-4" />
          </Button>
        )}
        {toolbarSlot && (
          <>
            <div className="w-px h-5 bg-border/70 mx-1" />
            <div className="flex items-center gap-1 ml-auto min-w-0">{toolbarSlot}</div>
          </>
        )}
      </div>
      {/* Single scrollable area — fills remaining space so body feels expansive, not boxed */}
      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-y-auto overscroll-contain"
      >
        <EditorContent editor={editor} />
        {footerSlot}
      </div>
    </div>
  );
}
