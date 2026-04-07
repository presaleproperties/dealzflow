import type { LucideIcon } from 'lucide-react';

interface CrmPagePlaceholderProps {
  title: string;
  icon: LucideIcon;
}

export function CrmPagePlaceholder({ title, icon: Icon }: CrmPagePlaceholderProps) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <Icon className="w-12 h-12 text-muted-foreground/40" strokeWidth={1.5} />
      <h1 className="text-2xl font-bold text-foreground">{title}</h1>
      <p className="text-sm text-muted-foreground">Coming soon</p>
    </div>
  );
}
