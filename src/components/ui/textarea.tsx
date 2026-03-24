import * as React from "react";

import { cn } from "@/lib/utils";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(({ className, ...props }, ref) => {
  return (
    <textarea
      className={cn(
        "flex min-h-[90px] w-full rounded-xl border border-border/70 bg-background/60 backdrop-blur-sm px-4 py-3 text-sm",
        "ring-offset-background placeholder:text-muted-foreground/45 tracking-[-0.01em]",
        "shadow-[inset_0_1px_2px_0_hsl(222_20%_6%/0.04)]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:border-primary/55 focus-visible:bg-background",
        "hover:border-border transition-all duration-200",
        "disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-muted/30",
        "resize-y",
        className,
      )}
      ref={ref}
      {...props}
    />
  );
});
Textarea.displayName = "Textarea";

export { Textarea };
