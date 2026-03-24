import * as React from "react";
import * as SwitchPrimitives from "@radix-ui/react-switch";

import { cn } from "@/lib/utils";

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitives.Root
    className={cn(
      "peer inline-flex h-[26px] w-[46px] shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-all duration-200",
      "data-[state=checked]:bg-primary data-[state=unchecked]:bg-muted/80",
      "data-[state=checked]:shadow-[0_0_0_3px_hsl(var(--primary)/0.15)]",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
      "disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    {...props}
    ref={ref}
  >
    <SwitchPrimitives.Thumb
      className={cn(
        "pointer-events-none block h-[21px] w-[21px] rounded-full ring-0 transition-all duration-200",
        "data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0",
      )}
      style={{
        background: 'hsl(var(--background))',
        boxShadow: '0 1px 4px hsl(0 0% 0% / 0.22), 0 0 0 0.5px hsl(0 0% 0% / 0.08)',
      }}
    />
  </SwitchPrimitives.Root>
));
Switch.displayName = SwitchPrimitives.Root.displayName;

export { Switch };
