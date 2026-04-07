import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-semibold ring-offset-background transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 active:scale-[0.97] select-none tracking-[-0.01em]",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-[0_1px_3px_0_hsl(39_60%_30%/0.28),0_4px_12px_-4px_hsl(39_60%_30%/0.24)] hover:brightness-110",
        destructive:
          "bg-destructive text-destructive-foreground shadow-[0_1px_3px_0_hsl(0_65%_18%/0.24)] hover:brightness-110",
        outline:
          "border border-primary/40 bg-background/60 backdrop-blur-sm shadow-[0_1px_2px_0_hsl(222_20%_6%/0.04)] hover:bg-primary/5 hover:border-primary/60 text-primary",
        secondary:
          "bg-secondary text-secondary-foreground shadow-[0_1px_2px_0_hsl(222_20%_6%/0.04)] hover:bg-secondary/70",
        ghost:
          "hover:bg-muted/60 hover:text-foreground text-muted-foreground",
        link:
          "text-primary underline-offset-4 hover:underline p-0 h-auto",
      },
      size: {
        default: "h-11 px-5 py-2.5",
        sm: "h-8 rounded-lg px-3.5 text-xs",
        lg: "h-12 rounded-lg px-8 text-[15px]",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
