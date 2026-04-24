import { ReactNode, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Sidebar } from './Sidebar';
import { useTheme } from 'next-themes';
import { ChevronLeft, Menu, Sun, Moon, Monitor } from 'lucide-react';
import { useSettings, useUpdateSettings } from '@/hooks/useSettings';
import { useAuth } from '@/hooks/useAuth';

interface HeaderProps {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  showAddDeal?: boolean;
  showBackButton?: boolean;
  backPath?: string;
}

const THEME_CYCLE: Array<'light' | 'dark' | 'system'> = ['light', 'dark', 'system'];

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const { user } = useAuth();
  const { data: settings } = useSettings();
  const updateSettings = useUpdateSettings({ silent: true });

  // On mount: restore theme from DB if user is logged in
  useEffect(() => {
    if (settings?.theme && settings.theme !== theme) {
      setTheme(settings.theme);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings?.theme]);

  function handleCycle() {
    const current = (theme as 'light' | 'dark' | 'system') ?? 'system';
    const idx = THEME_CYCLE.indexOf(current);
    const next = THEME_CYCLE[(idx + 1) % THEME_CYCLE.length];
    setTheme(next);
    if (user) {
      updateSettings.mutate({ theme: next });
    }
  }

  const Icon = theme === 'dark' ? Moon : theme === 'light' ? Sun : Monitor;
  const label = theme === 'dark' ? 'Dark' : theme === 'light' ? 'Light' : 'System';

  return (
    <button
      className="h-8 shrink-0 inline-flex items-center gap-1.5 px-2 rounded-[10px] text-muted-foreground/70 hover:text-foreground hover:bg-muted/50 active:scale-95 transition-all duration-200"
      onClick={handleCycle}
      aria-label={`Theme: ${label}. Click to cycle.`}
      title={`Theme: ${label}. Click to cycle.`}
    >
      <Icon className="h-[14px] w-[14px] transition-all duration-200" />
      <span className="hidden sm:inline text-[12px] font-medium leading-none">{label}</span>
    </button>
  );
}

export function Header({
  title,
  subtitle,
  action,
  showAddDeal = true,
  showBackButton = false,
  backPath = '/dashboard'
}: HeaderProps) {
  return (
    <header
      className="sticky top-0 z-40"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
    >
      {/* Glass background */}
      <div
        className="absolute inset-0 backdrop-blur-2xl backdrop-saturate-[180%]"
        style={{ background: 'hsl(var(--background) / 0.88)' }}
      />
      {/* Bottom hairline — gradient fade out at edges */}
      <div
        className="absolute inset-x-0 bottom-0 h-px"
        style={{
          background: 'linear-gradient(90deg, transparent, hsl(var(--border) / 0.7) 10%, hsl(var(--border) / 0.7) 90%, transparent)',
        }}
      />

      <div className="relative flex items-center justify-between h-[54px] md:h-[58px] lg:h-[52px] px-4 sm:px-5 md:px-6">
        {/* Left */}
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          {showBackButton ? (
            <Link
              to={backPath}
              className="md:hidden -ml-1.5 flex items-center text-primary font-semibold active:opacity-50 transition-all duration-200"
            >
              <ChevronLeft className="h-5 w-5" strokeWidth={2.5} />
              <span className="text-[15px] -ml-0.5 tracking-tight">Back</span>
            </Link>
          ) : (
            <Sheet>
              <SheetTrigger asChild className="md:hidden">
                <button className="shrink-0 -ml-1 h-9 w-9 flex items-center justify-center rounded-[12px] text-muted-foreground/70 hover:text-foreground hover:bg-muted/60 active:scale-95 transition-all duration-200">
                  <Menu className="h-[18px] w-[18px]" strokeWidth={2.2} />
                </button>
              </SheetTrigger>
              <SheetContent side="left" className="p-0 w-[240px] border-r-0" style={{ background: 'hsl(222 47% 11%)' }}>
                <Sidebar forceVisible />
              </SheetContent>
            </Sheet>
          )}

          <div className="min-w-0">
            <h1 className="text-[16px] md:text-[17px] lg:text-[16px] font-bold tracking-[-0.03em] truncate text-foreground leading-snug">
              {title}
            </h1>
            {subtitle && (
              <p className="text-[10.5px] md:text-[11.5px] text-muted-foreground/60 truncate hidden sm:block tracking-tight mt-0.5">
                {subtitle}
              </p>
            )}
          </div>
        </div>

        {/* Right */}
        <div className="flex items-center gap-1.5 shrink-0">
          <ThemeToggle />
          {action}
          {showAddDeal && (
            <Link to="/deals/new">
              <Button className="btn-premium h-[30px] md:h-8 px-3.5 md:px-4 text-[12px] font-semibold tracking-tight hidden sm:flex">
                New Deal
              </Button>
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
