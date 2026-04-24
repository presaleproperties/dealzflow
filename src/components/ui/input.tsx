import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-12 w-full rounded-xl border border-border bg-background px-4 py-2.5 text-base text-foreground ring-offset-background transition-colors duration-200",
          "file:border-0 file:bg-transparent file:text-[15px] file:font-medium file:text-foreground",
          "placeholder:text-muted-foreground/60",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:border-primary/60",
          "hover:border-border/90",
          "disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-muted/30",
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
