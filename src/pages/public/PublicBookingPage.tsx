import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate, Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Clock, MapPin, Phone, Video, ChevronLeft, ChevronRight, Check, CreditCard } from 'lucide-react';
import { addDays, format, startOfDay, isSameDay, addMonths, startOfMonth, endOfMonth, eachDayOfInterval, getDay, isBefore } from 'date-fns';
import { useOgMeta } from '@/lib/useOgMeta';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const BG = '#faf8f3';
const GOLD = '#D7A542';
const SERIF = 'Playfair Display, Georgia, serif';
const SANS = 'Public Sans, system-ui, sans-serif';

export default function PublicBookingPage() {
  const { teamSlug, eventSlug } = useParams<{ teamSlug: string; eventSlug: string }>();
  const [searchParams] = useSearchParams();
  const rescheduleId = searchParams.get('reschedule');
  const navigate = useNavigate();
  const [resolved, setResolved] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [monthStart, setMonthStart] = useState(startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [slots, setSlots] = useState<{ start: string; end: string }[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState<any>(null);

  const inviteeTz = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Vancouver', []
  );

  // Editorial fonts
  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (!document.getElementById('editorial-fonts')) {
      const link = document.createElement('link');
      link.id = 'editorial-fonts'; link.rel = 'stylesheet';
      link.href = 'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600&family=Public+Sans:wght@400;500;600&display=swap';
      document.head.appendChild(link);
    }
  }, []);

  useEffect(() => {
    if (!teamSlug || !eventSlug) return;
    (async () => {
      try {
        const res = await fetch(
          `${SUPABASE_URL}/functions/v1/scheduler-public-resolve?team=${encodeURIComponent(teamSlug)}&event=${encodeURIComponent(eventSlug)}`,
          { headers: { apikey: ANON_KEY } });
        const json = await res.json();
        if (!res.ok) { setError(json.error || 'not_found'); setLoading(false); return; }
        setResolved(json);
        setLoading(false);
      } catch (e) { setError(String((e as Error).message)); setLoading(false); }
    })();
  }, [teamSlug, eventSlug]);

  useEffect(() => {
    if (!resolved) return;
    setSlotsLoading(true);
    const from = format(startOfMonth(monthStart), 'yyyy-MM-dd');
    const to = format(endOfMonth(monthStart), 'yyyy-MM-dd');
    (async () => {
      try {
        const res = await fetch(
          `${SUPABASE_URL}/functions/v1/scheduler-public-availability?team=${teamSlug}&event=${eventSlug}&from=${from}&to=${to}`,
          { headers: { apikey: ANON_KEY } });
        const json = await res.json();
        setSlots(json.slots || []);
      } catch (e) { console.error(e); }
      finally { setSlotsLoading(false); }
    })();
  }, [resolved, monthStart, teamSlug, eventSlug]);

  const slotsByDay = useMemo(() => {
    const map = new Map<string, { start: string; end: string }[]>();
    slots.forEach(s => {
      const key = format(new Date(s.start), 'yyyy-MM-dd');
      const arr = map.get(key) || [];
      arr.push(s);
      map.set(key, arr);
    });
    return map;
  }, [slots]);

  const selectedDayKey = selectedDate ? format(selectedDate, 'yyyy-MM-dd') : null;
  const slotsForSelected = selectedDayKey ? (slotsByDay.get(selectedDayKey) || []) : [];

  const days = useMemo(() => {
    const start = startOfMonth(monthStart);
    const end = endOfMonth(monthStart);
    return eachDayOfInterval({ start, end });
  }, [monthStart]);

  const customQuestions: { key: string; text: string; required?: boolean; type?: 'text' | 'textarea' }[] =
    Array.isArray(resolved?.event_type?.custom_questions) ? resolved.event_type.custom_questions : [];

  const missingRequiredAnswers = customQuestions
    .filter((q) => q.required)
    .some((q) => !((answers[q.key] || '').trim()));

  const submit = async () => {
    if (!selectedSlot || !name || (!email && !phone) || missingRequiredAnswers) return;
    setSubmitting(true);
    try {
      const answerPayload = customQuestions
        .map((q) => ({ key: q.key, text: q.text, answer: answers[q.key] || null }))
        .filter((a) => a.answer);

      if (rescheduleId) {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/scheduler-reschedule`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: ANON_KEY },
          body: JSON.stringify({ booking_id: rescheduleId, new_start_at: selectedSlot, timezone: inviteeTz }),
        });
        const json = await res.json();
        if (!res.ok) {
          alert(json.error === 'slot_taken' ? 'That slot was just taken. Please pick another.' :
                json.error === 'already_cancelled' ? 'This booking has already been cancelled.' :
                'Could not reschedule. Please try again.');
          if (json.error === 'slot_taken') { setSelectedSlot(null); setStep(1); }
          setSubmitting(false);
          return;
        }
        setConfirmation(json.confirmation);
        setStep(3);
        setSubmitting(false);
        return;
      }

      if (resolved?.event_type?.requires_payment && resolved?.event_type?.price_cents) {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/scheduler-create-checkout`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: ANON_KEY },
          body: JSON.stringify({
            team_slug: teamSlug, event_slug: eventSlug, start_at: selectedSlot,
            timezone: inviteeTz,
            invitee: { name, email, phone, notes },
            answers: answerPayload,
            referrer: document.referrer,
            origin: window.location.origin,
          }),
        });
        const json = await res.json();
        if (!res.ok || !json.url) {
          alert(json.error === 'stripe_not_configured'
            ? 'Payments are not yet set up for this account. Please contact the agent.'
            : 'Could not start checkout. Please try again.');
          setSubmitting(false);
          return;
        }
        window.location.href = json.url;
        return;
      }

      const res = await fetch(`${SUPABASE_URL}/functions/v1/scheduler-public-book`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: ANON_KEY },
        body: JSON.stringify({
          team_slug: teamSlug, event_slug: eventSlug, start_at: selectedSlot,
          timezone: inviteeTz,
          invitee: { name, email, phone, notes },
          answers: answerPayload,
          referrer: document.referrer,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        if (json.error === 'slot_taken') {
          alert('Sorry, that slot was just taken. Please pick another time.');
          setSelectedSlot(null);
          setStep(1);
        } else {
          alert('Could not book. Please try again.');
        }
        setSubmitting(false);
        return;
      }
      setConfirmation(json.confirmation);
      setStep(3);
    } catch (e) {
      alert('Network error. Please try again.');
    } finally { setSubmitting(false); }
  };

  if (loading) return <div className="min-h-dvh flex items-center justify-center" style={{ background: BG, color: '#888' }}>Loading…</div>;
  if (error) return (
    <div className="min-h-dvh flex items-center justify-center" style={{ background: BG }}>
      <div className="text-center">
        <h1 className="text-2xl mb-2" style={{ fontFamily: SERIF, color: '#1a1a1a' }}>Page not found</h1>
        <Link to={`/r/${teamSlug}`} className="text-stone-500 hover:text-stone-700 text-sm">← Go back</Link>
      </div>
    </div>
  );

  const { agent, event_type: evt } = resolved;
  const Icon = evt.location_type === 'video' ? Video : evt.location_type === 'in_person' ? MapPin : Phone;

  if (typeof document !== 'undefined') document.title = `${evt.title} · ${agent.display_name}`;

  // SUCCESS view
  if (step === 3 && confirmation) {
    return (
      <div className="min-h-dvh flex items-center justify-center px-6 py-12" style={{ background: BG, fontFamily: SANS }}>
        <div className="max-w-md w-full text-center">
          <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-5">
            <Check className="w-7 h-7 text-emerald-600" />
          </div>
          <h1 className="text-[32px] mb-2" style={{ fontFamily: SERIF, color: '#1a1a1a', fontWeight: 500 }}>You're booked</h1>
          <p className="text-stone-600 text-[14px] mb-6">A confirmation has been sent to your email.</p>
          <div className="bg-white border border-stone-200 rounded-xl p-5 text-left space-y-2 shadow-sm">
            <div className="text-[12px] uppercase tracking-[0.18em] text-stone-400">{confirmation.event_title}</div>
            <div className="text-[16px] font-medium text-stone-900">
              {format(new Date(confirmation.start_at), 'EEEE, MMMM d')} · {format(new Date(confirmation.start_at), 'h:mm a')}
            </div>
            <div className="text-[12px] text-stone-500">with {confirmation.agent_name}</div>
          </div>
        </div>
      </div>
    );
  }

  const initials = (agent.display_name || 'B').split(' ').map((s: string) => s[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div className="min-h-dvh px-4 py-8 sm:px-6 sm:py-12 lg:py-16" style={{ background: BG, color: '#1a1a1a', fontFamily: SANS }}>
      <div className="max-w-[1000px] mx-auto">
        <Link to={`/r/${teamSlug}`} className="inline-flex items-center gap-1.5 text-[13px] text-stone-500 hover:text-stone-800 mb-6 transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" /> Back
        </Link>

        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-8 lg:gap-12">
          {/* Left: event detail */}
          <aside className="lg:border-r lg:pr-8" style={{ borderColor: '#e7e2d6' }}>
            <div className="flex items-center gap-3 mb-4">
              {agent.headshot_url ? (
                <img src={agent.headshot_url} alt={agent.display_name}
                  className="w-12 h-12 rounded-full object-cover" style={{ background: '#e7e2d6' }} />
              ) : (
                <div className="w-12 h-12 rounded-full flex items-center justify-center text-white text-[14px] font-medium"
                  style={{ background: GOLD, fontFamily: SERIF }}>{initials}</div>
              )}
              <div className="min-w-0">
                <div className="text-[12px] text-stone-500">{agent.display_name}</div>
                {agent.brokerage && <div className="text-[11px] text-stone-400 truncate">{agent.brokerage}</div>}
              </div>
            </div>

            <h1 className="text-[28px] sm:text-[30px] leading-tight mb-4 mt-2" style={{ fontFamily: SERIF, fontWeight: 500 }}>
              {evt.title}
            </h1>

            <div className="space-y-2 text-[13.5px] text-stone-600">
              <div className="flex items-center gap-2"><Clock className="w-3.5 h-3.5" />{evt.duration_min} min</div>
              <div className="flex items-center gap-2"><Icon className="w-3.5 h-3.5" />
                {evt.location_type === 'video' ? 'Video call' :
                 evt.location_type === 'in_person' ? 'In person' :
                 evt.location_type === 'phone' ? 'Phone call' : 'Custom'}
              </div>
              {evt.requires_payment && evt.price_cents > 0 && (
                <div className="flex items-center gap-2 font-medium" style={{ color: GOLD }}>
                  <CreditCard className="w-3.5 h-3.5" />
                  {(evt.price_cents / 100).toLocaleString('en-US', { style: 'currency', currency: evt.currency || 'CAD' })}
                </div>
              )}
            </div>

            {rescheduleId && (
              <div className="mt-4 px-3 py-2 bg-amber-50 border border-amber-200 rounded-md text-[12px] text-amber-900">
                Rescheduling — your original time will be cancelled when you confirm a new slot.
              </div>
            )}

            {evt.description && (
              <p className="text-[13.5px] text-stone-600 mt-5 leading-relaxed">{evt.description}</p>
            )}
          </aside>

          {/* Right: calendar/slots OR form */}
          <div>
            {step === 1 && (
              <>
                <div className="flex items-center justify-between mb-5">
                  <h2 className="text-[22px]" style={{ fontFamily: SERIF, fontWeight: 500 }}>{format(monthStart, 'MMMM yyyy')}</h2>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setMonthStart(addMonths(monthStart, -1))}
                      disabled={isBefore(addMonths(monthStart, -1), startOfMonth(new Date()))}
                      className="p-1.5 hover:bg-white rounded-md disabled:opacity-30 transition-colors">
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button onClick={() => setMonthStart(addMonths(monthStart, 1))}
                      className="p-1.5 hover:bg-white rounded-md transition-colors">
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="bg-white rounded-xl p-5 sm:p-6 border border-stone-200 shadow-sm">
                  <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-stone-400 uppercase tracking-wider mb-2">
                    {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => <div key={d}>{d}</div>)}
                  </div>
                  <div className="grid grid-cols-7 gap-1">
                    {Array.from({ length: getDay(days[0]) }).map((_, i) => <div key={`pad-${i}`} />)}
                    {days.map(d => {
                      const key = format(d, 'yyyy-MM-dd');
                      const has = (slotsByDay.get(key) || []).length > 0;
                      const isSel = selectedDate && isSameDay(selectedDate, d);
                      const isPast = isBefore(d, startOfDay(new Date()));
                      return (
                        <button
                          key={key}
                          disabled={!has || isPast}
                          onClick={() => setSelectedDate(d)}
                          className="aspect-square rounded-md text-[13.5px] transition-all"
                          style={{
                            background: isSel ? GOLD : (has && !isPast ? '#f4f0e6' : 'transparent'),
                            color: isSel ? 'white' : (has && !isPast ? '#1a1a1a' : '#d4ccba'),
                            fontWeight: isSel ? 600 : (has && !isPast ? 500 : 400),
                            cursor: !has || isPast ? 'not-allowed' : 'pointer',
                          }}
                        >
                          {format(d, 'd')}
                        </button>
                      );
                    })}
                  </div>

                  {slotsLoading && <p className="text-center text-[12px] text-stone-400 mt-4">Loading availability…</p>}

                  {selectedDate && (
                    <div className="mt-6 pt-5 border-t" style={{ borderColor: '#e7e2d6' }}>
                      <div className="text-[12px] text-stone-500 mb-3">
                        {format(selectedDate, 'EEEE, MMMM d')} · times shown in <span className="font-medium text-stone-700">{inviteeTz}</span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {slotsForSelected.length === 0 && <div className="col-span-full text-[13px] text-stone-400">No times available</div>}
                        {slotsForSelected.map(s => (
                          <button key={s.start}
                            onClick={() => { setSelectedSlot(s.start); setStep(2); }}
                            className="py-3 rounded-lg border border-stone-200 hover:border-[#D7A542] hover:bg-[#D7A542]/5 text-[13.5px] font-medium text-stone-800 transition-colors">
                            {format(new Date(s.start), 'h:mm a')}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}

            {step === 2 && selectedSlot && (
              <div className="bg-white rounded-xl p-6 sm:p-8 border border-stone-200 shadow-sm">
                <button onClick={() => setStep(1)} className="text-[12.5px] text-stone-500 hover:text-stone-800 mb-3 inline-flex items-center gap-1 transition-colors">
                  <ChevronLeft className="w-3.5 h-3.5" /> {format(new Date(selectedSlot), 'EEE, MMM d · h:mm a')}
                </button>
                <h2 className="text-[24px] mb-5" style={{ fontFamily: SERIF, fontWeight: 500 }}>Your details</h2>
                <div className="space-y-3.5">
                  <div>
                    <label className="text-[12px] text-stone-600 font-medium">Name *</label>
                    <input value={name} onChange={(e) => setName(e.target.value)}
                      className="w-full px-3.5 py-2.5 mt-1 border border-stone-200 rounded-md text-[14px] focus:outline-none focus:border-[#D7A542] bg-stone-50/50" />
                  </div>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-[12px] text-stone-600 font-medium">Email</label>
                      <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                        className="w-full px-3.5 py-2.5 mt-1 border border-stone-200 rounded-md text-[14px] focus:outline-none focus:border-[#D7A542] bg-stone-50/50" />
                    </div>
                    <div>
                      <label className="text-[12px] text-stone-600 font-medium">Phone</label>
                      <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
                        className="w-full px-3.5 py-2.5 mt-1 border border-stone-200 rounded-md text-[14px] focus:outline-none focus:border-[#D7A542] bg-stone-50/50" />
                    </div>
                  </div>
                  <p className="text-[11px] text-stone-400">Email or phone required.</p>
                  <div>
                    <label className="text-[12px] text-stone-600 font-medium">Notes (optional)</label>
                    <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
                      placeholder="What would you like to discuss?"
                      className="w-full px-3.5 py-2.5 mt-1 border border-stone-200 rounded-md text-[14px] focus:outline-none focus:border-[#D7A542] bg-stone-50/50" />
                  </div>

                  {customQuestions.length > 0 && (
                    <div className="space-y-3 pt-3 border-t" style={{ borderColor: '#e7e2d6' }}>
                      {customQuestions.map((q) => (
                        <div key={q.key}>
                          <label className="text-[12px] text-stone-600 font-medium">
                            {q.text}{q.required && <span style={{ color: GOLD }}> *</span>}
                          </label>
                          {q.type === 'textarea' ? (
                            <textarea
                              value={answers[q.key] || ''}
                              onChange={(e) => setAnswers((a) => ({ ...a, [q.key]: e.target.value }))}
                              rows={3}
                              className="w-full px-3.5 py-2.5 mt-1 border border-stone-200 rounded-md text-[14px] focus:outline-none focus:border-[#D7A542] bg-stone-50/50"
                            />
                          ) : (
                            <input
                              value={answers[q.key] || ''}
                              onChange={(e) => setAnswers((a) => ({ ...a, [q.key]: e.target.value }))}
                              className="w-full px-3.5 py-2.5 mt-1 border border-stone-200 rounded-md text-[14px] focus:outline-none focus:border-[#D7A542] bg-stone-50/50"
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  <button
                    onClick={submit}
                    disabled={submitting || !name || (!email && !phone) || missingRequiredAnswers}
                    className="w-full py-3.5 mt-2 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-[14px] rounded-lg transition-all hover:shadow-md"
                    style={{ background: '#1a1a1a' }}>
                    {submitting ? (rescheduleId ? 'Rescheduling…' : (evt.requires_payment ? 'Redirecting to payment…' : 'Booking…')) :
                     (rescheduleId ? 'Confirm new time' :
                      (evt.requires_payment ? `Continue to payment · ${(evt.price_cents/100).toLocaleString('en-US',{style:'currency',currency:evt.currency||'CAD'})}` : 'Confirm appointment'))}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

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
