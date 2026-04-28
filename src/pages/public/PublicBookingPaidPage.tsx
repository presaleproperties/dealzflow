import { useEffect, useState } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { Check, Loader2, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export default function PublicBookingPaidPage() {
  const { teamSlug } = useParams<{ teamSlug: string; eventSlug: string }>();
  const [params] = useSearchParams();
  const [state, setState] = useState<'verifying' | 'success' | 'error'>('verifying');
  const [confirmation, setConfirmation] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState<string>('');

  useEffect(() => {
    const sessionId = params.get('session_id');
    const intent = params.get('intent');
    if (!sessionId || !intent) { setState('error'); setErrorMsg('Missing payment reference.'); return; }
    (async () => {
      try {
        const res = await fetch(
          `${SUPABASE_URL}/functions/v1/scheduler-confirm-paid?session_id=${encodeURIComponent(sessionId)}&intent=${encodeURIComponent(intent)}`,
          { method: 'POST', headers: { apikey: ANON_KEY } });
        const json = await res.json();
        if (!res.ok) { setState('error'); setErrorMsg(json.error || 'verification_failed'); return; }
        setConfirmation(json.confirmation || json.booking || null);
        setState('success');
      } catch (e) { setState('error'); setErrorMsg(String((e as Error).message)); }
    })();
  }, [params]);

  if (state === 'verifying') return (
    <div className="min-h-screen bg-white flex items-center justify-center">
      <div className="text-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#D7A542] mx-auto mb-3" />
        <p className="text-neutral-500 text-[13.5px]">Confirming your payment…</p>
      </div>
    </div>
  );

  if (state === 'error') return (
    <div className="min-h-screen bg-white flex items-center justify-center px-6">
      <div className="text-center max-w-md">
        <AlertCircle className="w-10 h-10 text-amber-500 mx-auto mb-3" />
        <h1 className="text-[22px] font-serif text-neutral-900 mb-2" style={{ fontFamily: 'Georgia, serif' }}>Couldn't confirm booking</h1>
        <p className="text-neutral-500 text-[13.5px] mb-4">{errorMsg === 'payment_not_completed' ? 'Your payment did not complete.' : 'Please contact the agent — your card may have been charged but the booking was not finalized.'}</p>
        <Link to={`/book/${teamSlug}`} className="text-[13px] text-neutral-600 hover:text-neutral-900 underline">← Back to scheduling</Link>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-neutral-50 flex items-center justify-center px-6 py-12">
      <div className="max-w-md w-full text-center">
        <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-5">
          <Check className="w-7 h-7 text-green-600" />
        </div>
        <h1 className="text-[26px] font-serif text-neutral-900 mb-2" style={{ fontFamily: 'Georgia, serif' }}>Payment received</h1>
        <p className="text-neutral-600 text-[14px] mb-6">Your booking is confirmed. Check your inbox for details.</p>
        {confirmation && (
          <div className="bg-white border border-neutral-200 rounded-xl p-5 text-left space-y-2">
            <div className="text-[13px] text-neutral-500">{confirmation.event_title || 'Confirmed booking'}</div>
            {confirmation.start_at && (
              <div className="text-[15px] font-medium text-neutral-900">
                {format(new Date(confirmation.start_at), 'EEEE, MMMM d')} · {format(new Date(confirmation.start_at), 'h:mm a')}
              </div>
            )}
            {confirmation.agent_name && <div className="text-[12px] text-neutral-500">with {confirmation.agent_name}</div>}
          </div>
        )}
      </div>
    </div>
  );
}
