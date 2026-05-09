import { Toaster as Sonner, toast } from "sonner";
import { useTheme } from "next-themes";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      position="top-right"
      offset={16}
      gap={10}
      visibleToasts={5}
      expand
      closeButton
      className="toaster group"
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
