import * as React from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";

import { cn } from "@/lib/utils";

const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SliderPrimitive.Root
    ref={ref}
    className={cn("relative flex w-full touch-none select-none items-center py-1", className)}
    {...props}
  >
    <SliderPrimitive.Track
      className="relative h-2 w-full grow overflow-hidden rounded-full"
      style={{
        background: 'hsl(var(--muted) / 0.8)',
        boxShadow: 'inset 0 1px 3px hsl(222 20% 8% / 0.1)',
      }}
    >
      <SliderPrimitive.Range
        className="absolute h-full rounded-full"
        style={{
          background: 'linear-gradient(90deg, hsl(var(--primary) / 0.8), hsl(var(--primary)))',
        }}
      />
    </SliderPrimitive.Track>
    <SliderPrimitive.Thumb
      className="block h-[22px] w-[22px] rounded-full ring-offset-background transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 cursor-grab active:cursor-grabbing active:scale-110"
      style={{
        background: 'hsl(var(--background))',
        border: '2px solid hsl(var(--primary))',
        boxShadow: '0 1px 6px hsl(var(--primary) / 0.35), 0 2px 8px hsl(0 0% 0% / 0.18)',
      }}
    />
  </SliderPrimitive.Root>
));
Slider.displayName = SliderPrimitive.Root.displayName;

export { Slider };
