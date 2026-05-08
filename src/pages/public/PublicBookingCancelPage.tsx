import { useEffect, useState } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { format } from 'date-fns';
import { Check, AlertCircle, ArrowLeft } from 'lucide-react';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const BG = '#faf8f3';
const GOLD = '#D7A542';
const SERIF = 'Playfair Display, Georgia, serif';
const SANS = 'Public Sans, system-ui, sans-serif';

export default function PublicBookingCancelPage() {
  const { teamSlug } = useParams<{ teamSlug: string }>();
  const [params] = useSearchParams();
  const bookingId = params.get('b');

  const [loading, setLoading] = useState(true);
  const [booking, setBooking] = useState<any>(null);
  const [evt, setEvt] = useState<any>(null);
  const [agent, setAgent] = useState<any>(null);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (!document.getElementById('editorial-fonts')) {
      const link = document.createElement('link');
      link.id = 'editorial-fonts';
      link.rel = 'stylesheet';
      link.href = 'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600&family=Public+Sans:wght@400;500;600&display=swap';
      document.head.appendChild(link);
    }
  }, []);

  useEffect(() => {
    if (!bookingId) { setErr('Missing booking reference.'); setLoading(false); return; }
    (async () => {
      try {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/scheduler-reschedule?booking_id=${encodeURIComponent(bookingId)}`, {
          headers: { apikey: ANON_KEY },
        });
        const json = await res.json();
        if (!res.ok) {
          setErr(json.error === 'already_cancelled' ? 'This booking is already cancelled.' : 'We couldn\'t find this booking.');
        } else {
          setBooking(json.booking);
          setEvt(json.event_type);
          setAgent(json.agent);
        }
      } catch (e) {
        setErr('Network error. Please try again.');
      } finally { setLoading(false); }
    })();
  }, [bookingId]);

  const submit = async () => {
    if (!bookingId) return;
    setSubmitting(true); setErr(null);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/scheduler-cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: ANON_KEY },
        body: JSON.stringify({ booking_id: bookingId, by: 'invitee', reason: reason.trim() || null }),
      });
      const json = await res.json();
      if (!res.ok) { setErr(json.error || 'Could not cancel.'); setSubmitting(false); return; }
      setDone(true);
    } catch {
      setErr('Network error. Please try again.');
    } finally { setSubmitting(false); }
  };

  if (loading) return <div className="min-h-dvh flex items-center justify-center" style={{ background: BG, color: '#888' }}>Loading…</div>;

  if (done) {
    return (
      <div className="min-h-dvh flex items-center justify-center px-6 py-12" style={{ background: BG, fontFamily: SANS }}>
        <div className="max-w-md w-full text-center">
          <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-5">
            <Check className="w-7 h-7 text-emerald-600" />
          </div>
          <h1 className="text-[28px] mb-2" style={{ fontFamily: SERIF, color: '#1a1a1a', fontWeight: 500 }}>Booking cancelled</h1>
          <p className="text-stone-600 text-[14px]">{agent?.display_name ? `${agent.display_name} has been notified.` : 'The agent has been notified.'}</p>
          {teamSlug && (
            <Link to={`/r/${teamSlug}`} className="inline-block mt-6 text-[13px] text-stone-500 hover:text-stone-800 underline underline-offset-4">
              Book a new time
            </Link>
          )}
        </div>
      </div>
    );
  }

  if (err && !booking) {
    return (
      <div className="min-h-dvh flex items-center justify-center px-6" style={{ background: BG, fontFamily: SANS }}>
        <div className="text-center max-w-sm">
          <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-6 h-6 text-amber-700" />
          </div>
          <h1 className="text-[22px] mb-2" style={{ fontFamily: SERIF, color: '#1a1a1a', fontWeight: 500 }}>{err}</h1>
          {teamSlug && (
            <Link to={`/r/${teamSlug}`} className="text-[13px] text-stone-500 hover:text-stone-800 inline-flex items-center gap-1 mt-2">
              <ArrowLeft className="w-3.5 h-3.5" /> Back to booking page
            </Link>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh px-4 py-12 sm:py-16" style={{ background: BG, color: '#1a1a1a', fontFamily: SANS }}>
      <div className="max-w-md mx-auto">
        {teamSlug && (
          <Link to={`/r/${teamSlug}`} className="inline-flex items-center gap-1.5 text-[13px] text-stone-500 hover:text-stone-800 mb-6 transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" /> Back
          </Link>
        )}
        <h1 className="text-[28px] mb-1" style={{ fontFamily: SERIF, fontWeight: 500 }}>Cancel this booking?</h1>
        <p className="text-stone-500 text-[13.5px] mb-6">This will notify {agent?.display_name || 'your agent'} and free up the time slot.</p>

        <div className="bg-white border border-stone-200 rounded-xl p-5 shadow-sm space-y-1.5 mb-5">
          <div className="text-[10.5px] uppercase tracking-[0.18em] text-stone-400">{evt?.title || 'Meeting'}</div>
          <div className="text-[16px] font-medium text-stone-900">
            {booking?.start_at && format(new Date(booking.start_at), 'EEEE, MMMM d · h:mm a')}
          </div>
          {agent?.display_name && (
            <div className="text-[12.5px] text-stone-500">with {agent.display_name}</div>
          )}
        </div>

        <label className="text-[12px] text-stone-600 font-medium">Reason (optional)</label>
        <textarea
          value={reason} onChange={(e) => setReason(e.target.value)} rows={3}
          placeholder="Let the agent know why, if you'd like."
          className="w-full px-3.5 py-2.5 mt-1 mb-5 border border-stone-200 rounded-md text-[14px] focus:outline-none focus:border-[#D7A542] bg-stone-50/50"
        />

        {err && (
          <div className="mb-4 px-3 py-2.5 rounded-md text-[12.5px] bg-amber-50 border border-amber-200 text-amber-900">{err}</div>
        )}

        <div className="flex gap-2">
          {teamSlug && (
            <Link to={`/r/${teamSlug}`} className="flex-1 py-3 text-center rounded-lg border border-stone-200 text-stone-700 text-[14px] font-medium hover:bg-stone-50 transition-colors">
              Keep booking
            </Link>
          )}
          <button
            onClick={submit} disabled={submitting}
            className="flex-1 py-3 rounded-lg text-white text-[14px] font-semibold transition-all hover:shadow-md disabled:opacity-60"
            style={{ background: '#1a1a1a' }}
          >
            {submitting ? 'Cancelling…' : 'Cancel booking'}
          </button>
        </div>

        <p className="text-[11px] text-stone-400 text-center mt-6">
          Need a different time instead? Use the reschedule link in your confirmation email.
        </p>
      </div>
    </div>
  );
}
