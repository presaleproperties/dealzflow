import { useEffect, useState } from "react";
import { Toaster as Sonner, toast } from "sonner";
import { useTheme } from "next-themes";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const useIsMobile = () => {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    const update = () => setMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return mobile;
};

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();
  const isMobile = useIsMobile();

  // On phones the floating "Text Sent" / "Loaded …" toasts were landing on
  // top of the iOS status bar (time, signal, battery). Centre them under
  // the notch and offset by the real safe-area inset so they always read
  // as a clean banner instead of overlapping content.
  const position: ToasterProps["position"] = isMobile ? "top-center" : "top-right";
  const offset = isMobile
    ? "calc(env(safe-area-inset-top, 0px) + 14px)"
    : 16;

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      position={position}
      offset={offset}
      gap={isMobile ? 8 : 10}
      visibleToasts={isMobile ? 3 : 5}
      expand={!isMobile}
      closeButton
      className="toaster group"
      style={isMobile ? ({ "--width": "calc(100vw - 24px)" } as React.CSSProperties) : undefined}
      toastOptions={{
        duration: 6000,
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-card group-[.toaster]:text-foreground group-[.toaster]:border group-[.toaster]:border-border group-[.toaster]:shadow-2xl group-[.toaster]:rounded-xl group-[.toaster]:px-4 group-[.toaster]:py-3 group-[.toaster]:backdrop-blur-md",
          title: "group-[.toast]:text-[13.5px] group-[.toast]:font-semibold group-[.toast]:tracking-tight",
          description: "group-[.toast]:text-muted-foreground group-[.toast]:text-[12.5px] group-[.toast]:mt-0.5",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground group-[.toast]:rounded-md group-[.toast]:text-[12px] group-[.toast]:font-semibold",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
          closeButton:
            "group-[.toast]:bg-background group-[.toast]:border-border group-[.toast]:text-muted-foreground hover:group-[.toast]:text-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
