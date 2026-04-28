import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ArrowLeft, Clock, MapPin, Phone, Video, ChevronLeft, ChevronRight, Check } from 'lucide-react';
import { addDays, format, startOfDay, isSameDay, addMonths, startOfMonth, endOfMonth, eachDayOfInterval, getDay, isBefore } from 'date-fns';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export default function PublicBookingPage() {
  const { teamSlug, eventSlug } = useParams<{ teamSlug: string; eventSlug: string }>();
  const navigate = useNavigate();
  const [resolved, setResolved] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Step 1: pick date/time
  const [monthStart, setMonthStart] = useState(startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [slots, setSlots] = useState<{ start: string; end: string }[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);

  // Step 2: form
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState<any>(null);

  const inviteeTz = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Vancouver', []
  );

  // Resolve event type
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

  // Fetch slots for the visible month
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

  const submit = async () => {
    if (!selectedSlot || !name || (!email && !phone)) return;
    setSubmitting(true);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/scheduler-public-book`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: ANON_KEY },
        body: JSON.stringify({
          team_slug: teamSlug, event_slug: eventSlug, start_at: selectedSlot,
          timezone: inviteeTz,
          invitee: { name, email, phone, notes },
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

  if (loading) return <div className="min-h-screen bg-white flex items-center justify-center text-neutral-500">Loading…</div>;
  if (error) return (
    <div className="min-h-screen bg-white flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-serif text-neutral-900 mb-2">Page not found</h1>
        <Link to="/" className="text-neutral-500 hover:text-neutral-700 text-sm">← Go home</Link>
      </div>
    </div>
  );

  const { agent, event_type: evt } = resolved;
  const Icon = evt.location_type === 'video' ? Video : evt.location_type === 'in_person' ? MapPin : Phone;

  // SUCCESS view
  if (step === 3 && confirmation) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-white to-neutral-50 flex items-center justify-center px-6 py-12">
        <div className="max-w-md w-full text-center">
          <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-5">
            <Check className="w-7 h-7 text-green-600" />
          </div>
          <h1 className="text-[26px] font-serif text-neutral-900 mb-2" style={{ fontFamily: 'Georgia, serif' }}>You're booked</h1>
          <p className="text-neutral-600 text-[14px] mb-6">A confirmation will be sent to your email.</p>
          <div className="bg-white border border-neutral-200 rounded-xl p-5 text-left space-y-2">
            <div className="text-[13px] text-neutral-500">{confirmation.event_title}</div>
            <div className="text-[15px] font-medium text-neutral-900">
              {format(new Date(confirmation.start_at), 'EEEE, MMMM d')} · {format(new Date(confirmation.start_at), 'h:mm a')}
            </div>
            <div className="text-[12px] text-neutral-500">with {confirmation.agent_name}</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <Helmet><title>{`Book ${evt.title} with ${agent.display_name}`}</title></Helmet>
      <div className="min-h-screen bg-gradient-to-b from-white to-neutral-50">
        <div className="max-w-[920px] mx-auto px-6 py-10">
          <Link to={`/book/${teamSlug}`} className="inline-flex items-center gap-1.5 text-[13px] text-neutral-500 hover:text-neutral-800 mb-6">
            <ArrowLeft className="w-3.5 h-3.5" /> Back
          </Link>

          <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-6">
            {/* Left: event detail */}
            <div className="md:border-r md:border-neutral-200 md:pr-6">
              {agent.headshot_url && (
                <img src={agent.headshot_url} alt={agent.display_name}
                  className="w-14 h-14 rounded-full object-cover mb-3" />
              )}
              <div className="text-[12px] text-neutral-500">{agent.display_name}</div>
              <h1 className="text-[22px] font-serif text-neutral-900 mt-0.5 mb-3" style={{ fontFamily: 'Georgia, serif' }}>{evt.title}</h1>
              <div className="space-y-1.5 text-[13px] text-neutral-600">
                <div className="flex items-center gap-2"><Clock className="w-3.5 h-3.5" />{evt.duration_min} min</div>
                <div className="flex items-center gap-2"><Icon className="w-3.5 h-3.5" />
                  {evt.location_type === 'video' ? 'Video call' :
                   evt.location_type === 'in_person' ? 'In person' :
                   evt.location_type === 'phone' ? 'Phone call' : 'Custom'}
                </div>
              </div>
              {evt.description && <p className="text-[13px] text-neutral-600 mt-4 leading-relaxed">{evt.description}</p>}
            </div>

            {/* Right: calendar + slots OR form */}
            <div>
              {step === 1 && (
                <>
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-[16px] font-semibold text-neutral-900">{format(monthStart, 'MMMM yyyy')}</h2>
                    <div className="flex items-center gap-1">
                      <button onClick={() => setMonthStart(addMonths(monthStart, -1))}
                        disabled={isBefore(addMonths(monthStart, -1), startOfMonth(new Date()))}
                        className="p-1.5 hover:bg-neutral-100 rounded-md disabled:opacity-30">
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <button onClick={() => setMonthStart(addMonths(monthStart, 1))}
                        className="p-1.5 hover:bg-neutral-100 rounded-md">
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-7 gap-1 text-center text-[10.5px] text-neutral-400 uppercase tracking-wider mb-2">
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
                          className={`aspect-square rounded-md text-[13px] transition-all ${
                            isSel ? 'bg-[#D7A542] text-white font-semibold' :
                            has && !isPast ? 'bg-neutral-100 hover:bg-neutral-200 text-neutral-900 font-medium' :
                            'text-neutral-300 cursor-not-allowed'
                          }`}
                        >
                          {format(d, 'd')}
                        </button>
                      );
                    })}
                  </div>

                  {slotsLoading && <p className="text-center text-[12px] text-neutral-400 mt-4">Loading availability…</p>}

                  {selectedDate && (
                    <div className="mt-5 pt-5 border-t border-neutral-200">
                      <div className="text-[12.5px] text-neutral-500 mb-3">
                        {format(selectedDate, 'EEEE, MMMM d')} · times in <span className="font-medium">{inviteeTz}</span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {slotsForSelected.length === 0 && <div className="col-span-full text-[13px] text-neutral-400">No times available</div>}
                        {slotsForSelected.map(s => (
                          <button key={s.start}
                            onClick={() => { setSelectedSlot(s.start); setStep(2); }}
                            className="py-2.5 rounded-md border border-neutral-200 hover:border-[#D7A542] hover:bg-[#D7A542]/5 text-[13px] font-medium text-neutral-800 transition-colors">
                            {format(new Date(s.start), 'h:mm a')}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}

              {step === 2 && selectedSlot && (
                <>
                  <button onClick={() => setStep(1)} className="text-[12.5px] text-neutral-500 hover:text-neutral-800 mb-3 inline-flex items-center gap-1">
                    <ChevronLeft className="w-3.5 h-3.5" /> {format(new Date(selectedSlot), 'EEE, MMM d · h:mm a')}
                  </button>
                  <h2 className="text-[18px] font-semibold text-neutral-900 mb-4">Enter your details</h2>
                  <div className="space-y-3">
                    <div>
                      <label className="text-[12px] text-neutral-600">Name *</label>
                      <input value={name} onChange={(e) => setName(e.target.value)}
                        className="w-full px-3 py-2 border border-neutral-200 rounded-md text-[14px] focus:outline-none focus:border-[#D7A542]" />
                    </div>
                    <div>
                      <label className="text-[12px] text-neutral-600">Email</label>
                      <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                        className="w-full px-3 py-2 border border-neutral-200 rounded-md text-[14px] focus:outline-none focus:border-[#D7A542]" />
                    </div>
                    <div>
                      <label className="text-[12px] text-neutral-600">Phone</label>
                      <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
                        className="w-full px-3 py-2 border border-neutral-200 rounded-md text-[14px] focus:outline-none focus:border-[#D7A542]" />
                    </div>
                    <p className="text-[11px] text-neutral-400">Email or phone required.</p>
                    <div>
                      <label className="text-[12px] text-neutral-600">Notes (optional)</label>
                      <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
                        placeholder="What would you like to discuss?"
                        className="w-full px-3 py-2 border border-neutral-200 rounded-md text-[14px] focus:outline-none focus:border-[#D7A542]" />
                    </div>
                    <button
                      onClick={submit}
                      disabled={submitting || !name || (!email && !phone)}
                      className="w-full py-3 bg-[#D7A542] hover:bg-[#c69537] disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-[14px] rounded-md transition-colors">
                      {submitting ? 'Booking…' : 'Confirm booking'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          <footer className="text-center mt-10 text-[11px] text-neutral-400">Powered by DealzFlow</footer>
        </div>
      </div>
    </>
  );
}
