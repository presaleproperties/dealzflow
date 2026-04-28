import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';

import { supabase } from '@/integrations/supabase/client';
import { Clock, MapPin, Phone, Video, ChevronRight } from 'lucide-react';

interface Resolved {
  agent: { user_id: string; slug: string; display_name: string; email: string; headshot_url?: string; brokerage?: string; license_no?: string; timezone?: string; bio?: string; };
}

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
        // Use direct query for agent + active event types via service via the resolve-agent function
        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/scheduler-public-agent?team=${encodeURIComponent(teamSlug)}`,
          { headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY } },
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

  if (loading) {
    return <div className="min-h-screen bg-white flex items-center justify-center text-neutral-500">Loading…</div>;
  }
  if (err || !agent) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-serif text-neutral-900 mb-2">Page not found</h1>
          <p className="text-neutral-500">This booking page doesn't exist.</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <Helmet>
        <title>{`Book a meeting with ${agent.display_name}`}</title>
        <meta name="description" content={`Schedule a meeting with ${agent.display_name}${agent.brokerage ? ' · ' + agent.brokerage : ''}.`} />
        <meta property="og:title" content={`Book ${agent.display_name}`} />
      </Helmet>

      <div className="min-h-screen bg-gradient-to-b from-white to-neutral-50">
        <div className="max-w-[760px] mx-auto px-6 py-12 sm:py-16">
          <header className="text-center mb-10">
            {agent.headshot_url && (
              <img src={agent.headshot_url} alt={agent.display_name}
                className="w-24 h-24 rounded-full object-cover mx-auto mb-4 ring-4 ring-white shadow-lg" />
            )}
            <h1 className="text-[32px] font-serif text-neutral-900 tracking-tight" style={{ fontFamily: 'Georgia, serif' }}>
              {agent.display_name}
            </h1>
            {agent.brokerage && (
              <p className="text-[13.5px] text-neutral-600 mt-1.5">{agent.brokerage}</p>
            )}
            {agent.bio && (
              <p className="text-[14px] text-neutral-700 mt-4 max-w-md mx-auto leading-relaxed">{agent.bio}</p>
            )}
          </header>

          <h2 className="text-[11px] font-medium uppercase tracking-[0.2em] text-neutral-400 mb-3 text-center">
            Pick a meeting type
          </h2>

          <div className="space-y-2.5">
            {eventTypes.length === 0 ? (
              <p className="text-center text-neutral-500 text-sm py-12">No bookable events right now.</p>
            ) : eventTypes.map((et) => {
              const Icon = et.location_type === 'video' ? Video : et.location_type === 'in_person' ? MapPin : Phone;
              return (
                <Link key={et.id} to={`/book/${teamSlug}/${et.slug}`}
                  className="block p-5 bg-white rounded-xl border border-neutral-200 hover:border-[#D7A542] hover:shadow-md transition-all">
                  <div className="flex items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-[16px] font-semibold text-neutral-900">{et.title}</h3>
                      {et.description && (
                        <p className="text-[13px] text-neutral-600 mt-1 line-clamp-2">{et.description}</p>
                      )}
                      <div className="flex items-center gap-3 mt-2 text-[12px] text-neutral-500">
                        <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{et.duration_min} min</span>
                        <span className="flex items-center gap-1"><Icon className="w-3 h-3" />
                          {et.location_type === 'video' ? 'Video' : et.location_type === 'in_person' ? 'In person' : 'Phone'}
                        </span>
                        {et.requires_payment && et.price_cents > 0 && (
                          <span>${(et.price_cents/100).toFixed(0)} {et.currency}</span>
                        )}
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-neutral-300 shrink-0" />
                  </div>
                </Link>
              );
            })}
          </div>

          <footer className="text-center mt-12 text-[11px] text-neutral-400">
            Powered by DealzFlow
          </footer>
        </div>
      </div>
    </>
  );
}
