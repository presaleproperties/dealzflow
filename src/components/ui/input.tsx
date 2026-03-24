import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-11 w-full rounded-xl border border-border/70 bg-background/60 backdrop-blur-sm px-4 py-2.5 text-base ring-offset-background transition-all duration-200",
          "shadow-[inset_0_1px_2px_0_hsl(222_20%_6%/0.04)]",
          "file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
          "placeholder:text-muted-foreground/45",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:border-primary/55 focus-visible:bg-background",
          "hover:border-border",
          "disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-muted/30",
          "md:text-sm tracking-[-0.01em]",
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
