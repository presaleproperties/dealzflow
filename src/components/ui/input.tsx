import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-12 w-full rounded-xl border border-border/60 bg-muted/30 px-4 py-2.5 text-base ring-offset-background transition-all duration-200",
          "shadow-[inset_0_1px_3px_0_hsl(222_20%_8%/0.07),inset_0_0_0_0_transparent]",
          "file:border-0 file:bg-transparent file:text-[15px] file:font-medium file:text-foreground",
          "placeholder:text-muted-foreground/40",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25 focus-visible:border-primary/50 focus-visible:bg-background/80",
          "hover:border-border/80 hover:bg-muted/40",
          "disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-muted/20",
          "md:text-[15px] tracking-[-0.01em] font-medium",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };
