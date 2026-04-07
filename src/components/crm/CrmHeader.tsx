import { Search, Bell } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

export function CrmHeader() {
  const { user } = useAuth();
  const initials = user?.email?.slice(0, 2).toUpperCase() || 'U';

  return (
    <div className="flex items-center justify-between h-14 px-4 lg:px-6 border-b border-border bg-card/80">
      {/* Left: Breadcrumb */}
      <span className="text-sm font-bold tracking-tight" style={{ color: 'hsl(39 67% 55%)' }}>
        CRM
      </span>

      {/* Center: Search */}
      <div className="hidden sm:flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-1.5 w-full max-w-sm mx-4">
        <Search className="w-4 h-4 text-muted-foreground shrink-0" />
        <input
          type="text"
          placeholder="Search leads, projects..."
          className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none w-full"
        />
      </div>

      {/* Right: Bell + Avatar */}
      <div className="flex items-center gap-3">
        <button className="relative p-1.5 rounded-lg hover:bg-muted/50 transition-colors">
          <Bell className="w-[18px] h-[18px] text-muted-foreground" />
          <span className="absolute top-0.5 right-0.5 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-card flex items-center justify-center">
            <span className="sr-only">3 notifications</span>
          </span>
        </button>
        <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ background: 'hsl(39 67% 55%)' }}>
          {initials}
        </div>
      </div>
    </div>
  );
}
