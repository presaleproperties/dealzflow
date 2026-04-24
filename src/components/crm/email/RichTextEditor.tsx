import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { Bold, Italic, List, ListOrdered, Heading2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useEffect, useRef, type ReactNode } from 'react';

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
}

export function RichTextEditor({
  content,
  onChange,
  placeholder = 'Write your email...',
  footerSlot,
  toolbarSlot,
  maxBodyHeight = 460,
}: Props) {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder }),
    ],
    content,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      attributes: {
        // When a signature/footer is rendered below, drop the bottom padding
        // and last-paragraph margin so text can sit flush against it.
        class: `prose prose-sm max-w-none min-h-[200px] px-4 pt-4 outline-none text-foreground [&_p:last-child]:mb-0 ${
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

  if (!editor) return null;

  const btnClass = 'h-8 w-8 p-0';

  return (
    <div className="border border-border rounded-xl overflow-hidden bg-background">
      <div className="flex items-center gap-0.5 p-1.5 border-b border-border bg-muted/30">
        <Button type="button" variant={editor.isActive('bold') ? 'secondary' : 'ghost'} size="sm" className={btnClass} onClick={() => editor.chain().focus().toggleBold().run()}>
          <Bold className="w-4 h-4" />
        </Button>
        <Button type="button" variant={editor.isActive('italic') ? 'secondary' : 'ghost'} size="sm" className={btnClass} onClick={() => editor.chain().focus().toggleItalic().run()}>
          <Italic className="w-4 h-4" />
        </Button>
        <Button type="button" variant={editor.isActive('heading') ? 'secondary' : 'ghost'} size="sm" className={btnClass} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
          <Heading2 className="w-4 h-4" />
        </Button>
        <Button type="button" variant={editor.isActive('bulletList') ? 'secondary' : 'ghost'} size="sm" className={btnClass} onClick={() => editor.chain().focus().toggleBulletList().run()}>
          <List className="w-4 h-4" />
        </Button>
        <Button type="button" variant={editor.isActive('orderedList') ? 'secondary' : 'ghost'} size="sm" className={btnClass} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
          <ListOrdered className="w-4 h-4" />
        </Button>
        {toolbarSlot && (
          <>
            <div className="w-px h-5 bg-border/70 mx-1" />
            <div className="flex items-center gap-1 ml-auto">{toolbarSlot}</div>
          </>
        )}
      </div>
      {/* Single scrollable area: typed content + signature live in one box. */}
      <div
        ref={scrollRef}
        className="overflow-y-auto"
        style={{ maxHeight: maxBodyHeight }}
      >
        <EditorContent editor={editor} />
        {footerSlot}
      </div>
    </div>
  );
}
