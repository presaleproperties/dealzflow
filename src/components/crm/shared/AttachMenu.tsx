import { useRef, useState } from 'react';
import { Paperclip, Image as ImageIcon, Camera, FileUp, Loader2 } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetClose,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

type Variant = 'pill' | 'icon';

type Props = {
  /** Called with one or more files chosen by the user. */
  onFiles: (files: File[]) => void | Promise<void>;
  /** When true, shows a spinner inside the button. */
  uploading?: boolean;
  /** Disable the trigger entirely. */
  disabled?: boolean;
  /** Restrict file picker (`image/*`, `image/*,video/*`, etc.). Defaults to all. */
  accept?: string;
  /** Allow multiple files. Defaults to true. */
  multiple?: boolean;
  /** Visual style. `pill` = "Attach" with text. `icon` = compact icon-only. */
  variant?: Variant;
  /** Optional extra className on the trigger button. */
  className?: string;
  /** Optional label override (pill variant only). */
  label?: string;
};

/**
 * Unified attachment trigger.
 * - **Mobile**: opens an iOS-style bottom Sheet with Photo Library / Take Photo / File.
 * - **Desktop**: opens the native file picker directly.
 *
 * Drag-and-drop + paste-image are handled by `useDragAndPasteFiles` on the
 * surrounding composer surface — keep both wired together for full coverage.
 */
export function AttachMenu({
  onFiles,
  uploading,
  disabled,
  accept,
  multiple = true,
  variant = 'pill',
  className,
  label = 'Attach',
}: Props) {
  const isMobile = useIsMobile();
  const [sheetOpen, setSheetOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const fire = (input: HTMLInputElement | null) => {
    if (!input) return;
    input.value = '';
    input.click();
  };

  const handleChange = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setSheetOpen(false);
    await onFiles(Array.from(files));
  };

  const handleDesktopClick = () => fire(fileRef.current);
  const handleMobileClick = () => setSheetOpen(true);

  return (
    <>
      {/* Hidden inputs — separate refs so each option targets the right capture mode. */}
      <input
        ref={fileRef}
        type="file"
        multiple={multiple}
        accept={accept}
        className="hidden"
        onChange={(e) => handleChange(e.target.files)}
      />
      {isMobile && (
        <>
          <input
            ref={photoRef}
            type="file"
            multiple={multiple}
            accept="image/*,video/*"
            className="hidden"
            onChange={(e) => handleChange(e.target.files)}
          />
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => handleChange(e.target.files)}
          />
        </>
      )}

      {variant === 'icon' ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={disabled || uploading}
          onClick={isMobile ? handleMobileClick : handleDesktopClick}
          className={cn('h-8 w-8', className)}
          title="Attach"
          aria-label="Attach"
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
        </Button>
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled || uploading}
          onClick={isMobile ? handleMobileClick : handleDesktopClick}
          className={cn('gap-1.5', className)}
          title="Attach files or images"
        >
          {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />}
          {label}
        </Button>
      )}

      {/* iOS-style action sheet — mobile only */}
      {isMobile && (
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetContent
            side="bottom"
            className={cn(
              'rounded-t-2xl border-t bg-background/95 backdrop-blur',
              'pb-[max(env(safe-area-inset-bottom),16px)]',
              'p-0',
            )}
          >
            <SheetHeader className="px-4 pt-3 pb-2 text-left">
              <SheetTitle className="text-[13px] font-semibold text-muted-foreground">
                Add attachment
              </SheetTitle>
            </SheetHeader>
            <div className="px-3 pb-3 space-y-2">
              <button
                type="button"
                onClick={() => fire(photoRef.current)}
                className="w-full flex items-center gap-3 px-3 h-12 rounded-xl bg-muted/60 active:bg-muted transition text-left"
              >
                <ImageIcon className="h-5 w-5 text-foreground/70" />
                <span className="text-[15px] font-medium">Photo Library</span>
              </button>
              <button
                type="button"
                onClick={() => fire(cameraRef.current)}
                className="w-full flex items-center gap-3 px-3 h-12 rounded-xl bg-muted/60 active:bg-muted transition text-left"
              >
                <Camera className="h-5 w-5 text-foreground/70" />
                <span className="text-[15px] font-medium">Take Photo</span>
              </button>
              <button
                type="button"
                onClick={() => fire(fileRef.current)}
                className="w-full flex items-center gap-3 px-3 h-12 rounded-xl bg-muted/60 active:bg-muted transition text-left"
              >
                <FileUp className="h-5 w-5 text-foreground/70" />
                <span className="text-[15px] font-medium">Choose File</span>
              </button>
              <SheetClose asChild>
                <button
                  type="button"
                  className="w-full h-12 rounded-xl bg-primary/10 text-primary text-[15px] font-semibold active:bg-primary/15 transition mt-1"
                >
                  Cancel
                </button>
              </SheetClose>
            </div>
          </SheetContent>
        </Sheet>
      )}
    </>
  );
}
