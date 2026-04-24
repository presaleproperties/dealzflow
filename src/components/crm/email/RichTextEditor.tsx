import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { Bold, Italic, List, ListOrdered, Heading2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useEffect, type ReactNode } from 'react';

interface Props {
  content: string;
  onChange: (html: string) => void;
  placeholder?: string;
  /** Optional content rendered inside the same bordered container, beneath the editor body. */
  footerSlot?: ReactNode;
  /** Optional extra controls rendered on the right side of the toolbar row. */
  toolbarSlot?: ReactNode;
}

export function RichTextEditor({ content, onChange, placeholder = 'Write your email...', footerSlot, toolbarSlot }: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder }),
    ],
    content,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none min-h-[200px] p-4 outline-none text-foreground',
      },
    },
  });

  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content);
    }
  }, [content]);

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
      <EditorContent editor={editor} />
      {footerSlot}
    </div>
  );
}
