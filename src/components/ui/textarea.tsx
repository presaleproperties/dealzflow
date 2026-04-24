import * as React from "react";

import { cn } from "@/lib/utils";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(({ className, ...props }, ref) => {
  return (
    <textarea
      className={cn(
        "flex min-h-[90px] w-full rounded-xl border border-border bg-background px-4 py-3 text-[15px] text-foreground",
        "ring-offset-background placeholder:text-muted-foreground/60 tracking-[-0.01em]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25 focus-visible:border-primary/60",
        "hover:border-border/90 transition-colors duration-200",
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
