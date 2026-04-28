import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Clock, MapPin, Phone, Video, ChevronRight } from 'lucide-react';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// Editorial Linen booking landing page.
// NO DealzFlow branding — agent-first identity (headshot is the hero).
export default function PublicAgentLandingPage() {
  const { teamSlug } = useParams<{ teamSlug: string }>();
  const [agent, setAgent] = useState<any>(null);
  const [eventTypes, setEventTypes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!teamSlug) return;
      try {
        const res = await fetch(
          `${SUPABASE_URL}/functions/v1/scheduler-public-agent?team=${encodeURIComponent(teamSlug)}`,
          { headers: { apikey: ANON_KEY } },
        );
        const json = await res.json();
        if (!mounted) return;
        if (!res.ok) { setErr(json.error || 'Not found'); setLoading(false); return; }
        setAgent(json.agent);
        setEventTypes(json.event_types || []);
        setLoading(false);
      } catch (e) {
        if (mounted) { setErr(String((e as Error).message)); setLoading(false); }
      }
    })();
    return () => { mounted = false; };
  }, [teamSlug]);

  // Inject editorial fonts + favicon override (one-time)
  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (!document.getElementById('editorial-fonts')) {
      const link = document.createElement('link');
      link.id = 'editorial-fonts';
      link.rel = 'stylesheet';
      link.href = 'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600&family=Public+Sans:wght@400;500;600&display=swap';
      document.head.appendChild(link);
    }
    if (agent?.display_name) {
      document.title = `Book with ${agent.display_name}`;
      // neutral favicon — agent's initial
      const initial = (agent.display_name || 'B').trim().charAt(0).toUpperCase();
      const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><circle cx='32' cy='32' r='32' fill='%23D7A542'/><text x='50%' y='50%' text-anchor='middle' dominant-baseline='central' font-family='Georgia,serif' font-size='34' fill='white'>${initial}</text></svg>`;
      const url = `data:image/svg+xml,${svg}`;
      const existing = document.querySelector("link[rel='icon']") as HTMLLinkElement | null;
      if (existing) existing.href = url; else {
        const l = document.createElement('link'); l.rel = 'icon'; l.href = url; document.head.appendChild(l);
      }
    }
  }, [agent?.display_name]);

  if (loading) {
    return <div className="min-h-dvh flex items-center justify-center" style={{ background: '#faf8f3', color: '#888' }}>Loading…</div>;
  }
  if (err || !agent) {
    return (
      <div className="min-h-dvh flex items-center justify-center" style={{ background: '#faf8f3' }}>
        <div className="text-center">
          <h1 className="text-2xl mb-2" style={{ fontFamily: 'Playfair Display, Georgia, serif', color: '#1a1a1a' }}>Page not found</h1>
          <p className="text-stone-500">This booking page doesn't exist.</p>
        </div>
      </div>
    );
  }

  const initials = (agent.display_name || 'B').split(' ').map((s: string) => s[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div className="min-h-dvh px-4 py-12 sm:px-6 sm:py-16 lg:py-20" style={{ background: '#faf8f3', color: '#1a1a1a', fontFamily: 'Public Sans, system-ui, sans-serif' }}>
      <div className="max-w-[640px] mx-auto">
        {/* Hero — agent-first */}
        <header className="flex flex-col items-center gap-5 mb-12">
          {agent.headshot_url ? (
            <img src={agent.headshot_url} alt={agent.display_name}
              className="w-32 h-32 sm:w-36 sm:h-36 rounded-full object-cover shadow-md"
              style={{ background: '#e7e2d6' }} />
          ) : (
            <div className="w-32 h-32 sm:w-36 sm:h-36 rounded-full flex items-center justify-center text-3xl font-medium shadow-md"
              style={{ background: '#D7A542', color: 'white', fontFamily: 'Playfair Display, Georgia, serif' }}>
              {initials}
            </div>
          )}
          <div className="text-center">
            <h1 className="text-[40px] sm:text-[48px] leading-tight font-medium tracking-tight"
              style={{ fontFamily: 'Playfair Display, Georgia, serif' }}>
              {agent.display_name}
            </h1>
            {agent.brokerage && (
              <p className="text-[15px] sm:text-[16px] text-stone-500 mt-1">{agent.brokerage}</p>
            )}
          </div>
          {agent.bio && (
            <p className="text-[14.5px] text-stone-600 text-center max-w-md leading-relaxed mt-1">{agent.bio}</p>
          )}
        </header>

        {/* Section divider */}
        <div className="flex items-center gap-3 mb-6">
          <div className="h-px flex-1" style={{ background: '#e7e2d6' }} />
          <span className="text-[10.5px] uppercase tracking-[0.22em] text-stone-500">Book a Consultation</span>
          <div className="h-px flex-1" style={{ background: '#e7e2d6' }} />
        </div>

        {/* Event types */}
        <div className="space-y-3">
          {eventTypes.length === 0 ? (
            <p className="text-center text-stone-500 text-sm py-12">No bookable events right now.</p>
          ) : eventTypes.map((et) => {
            const Icon = et.location_type === 'video' ? Video : et.location_type === 'in_person' ? MapPin : Phone;
            return (
              <Link key={et.id} to={`/r/${teamSlug}/${et.slug}`}
                className="group block p-5 sm:p-6 rounded-xl bg-white border border-stone-200 hover:border-[#D7A542] hover:shadow-md transition-all">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-full flex items-center justify-center shrink-0 text-white text-[15px] font-semibold tracking-tight"
                    style={{ background: et.color || '#D7A542' }}>
                    {et.duration_min}<span className="text-[10px] font-normal opacity-90">m</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-[17px] sm:text-[18px] font-semibold text-stone-900 leading-tight"
                      style={{ fontFamily: 'Playfair Display, Georgia, serif', fontWeight: 500 }}>
                      {et.title}
                    </h3>
                    {et.description && (
                      <p className="text-[13px] text-stone-500 mt-1 line-clamp-2">{et.description}</p>
                    )}
                    <div className="flex items-center gap-3 mt-2 text-[11.5px] text-stone-500">
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{et.duration_min} min</span>
                      <span className="flex items-center gap-1"><Icon className="w-3 h-3" />
                        {et.location_type === 'video' ? 'Video' : et.location_type === 'in_person' ? 'In person' : 'Phone'}
                      </span>
                      {et.requires_payment && et.price_cents > 0 && (
                        <span className="font-medium" style={{ color: '#D7A542' }}>
                          ${(et.price_cents / 100).toFixed(0)} {et.currency}
                        </span>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-stone-300 group-hover:text-[#D7A542] shrink-0 transition-colors" />
                </div>
              </Link>
            );
          })}
        </div>

        {/* Tasteful brokerage footer — no DealzFlow */}
        <footer className="mt-16 pt-8 text-center" style={{ borderTop: '1px solid #e7e2d6' }}>
          <p className="text-[11.5px] text-stone-400 uppercase tracking-[0.18em]">
            {agent.brokerage || agent.display_name}
            {agent.license_no && <> · License {agent.license_no}</>}
          </p>
        </footer>
      </div>
    </div>
  );
}
