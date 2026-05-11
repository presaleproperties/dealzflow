import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Sparkles, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useOnboardingProgress } from '@/hooks/useOnboardingProgress';

const SECTIONS = [
  {
    icon: Sparkles,
    title: 'Day 1 — Workspace setup',
    intro: 'Everyone follows these 6 steps. Total time: 10–15 minutes. You can skip any step and come back to it later from this page or the dashboard banner.',
    steps: [
      {
        id: 'profile',
        title: '1. Confirm your profile',
        body: 'Full name, mobile, license #, and brokerage. We pre-fill what we can from your Presale Properties profile so you usually only need to confirm.',
        cta: { to: '/settings?tab=profile', label: 'Edit profile' },
      },
      {
        id: 'province',
        title: '2. Set your province',
        body: 'Drives Safe-to-Spend math, GST handling, and tax projections. Default is BC. Change it any time in Settings.',
        cta: { to: '/settings', label: 'Open settings' },
      },
      {
        id: 'rezen',
        title: '3. Connect ReZen',
        body: 'Sign in at app.therealbrokerage.com → Profile → API Keys → create a key → paste into Settings → Integrations. Auto-syncs deals, payouts, and revenue share daily at 6 AM UTC.',
        cta: { to: '/settings?tab=integrations', label: 'Connect ReZen' },
      },
      {
        id: 'google',
        title: '4. Connect Google',
        body: 'Calendar sync (showings + meetings appear on the dashboard) and Gmail (so emails send from your address with brand templates).',
        cta: { to: '/settings?tab=integrations', label: 'Connect Google' },
      },
      {
        id: 'signature',
        title: '5. Email signature',
        body: 'Used on every email — from CRM sends to Presale Properties project sends. Edit your headshot, title, license, and links in Settings → Profile.',
        cta: { to: '/settings?tab=profile', label: 'Edit signature' },
      },
      {
        id: 'push',
        title: '6. Install + notifications',
        body: 'Add to home screen (iPhone: Share → Add to Home Screen / Android: menu → Install app). Then enable push so hot leads and overdue follow-ups never slip.',
      },
    ],
  },
  {
    icon: Users,
    title: 'CRM team members — 3 extra steps',
    intro: 'These only appear for agents who have been invited to the team CRM by an admin. The CRM is invite-only — there is no public way to join.',
    steps: [
      {
        id: 'crm_sources',
        title: '7. Your CRM territory',
        body: 'We route leads from Fraser Valley cities only. Your admin assigns which cities and which sources (Presale, Lofty, TikTok, referrals, SMS opt-ins) route to you. Reroute any source from CRM → Settings → Lead Sources.',
        cta: { to: '/crm/settings', label: 'Open CRM settings' },
      },
      {
        id: 'crm_sms',
        title: '8. SMS / WhatsApp number',
        body: 'Twilio-powered. Ask your admin to provision a number and link it to your account. Single send from a lead profile, bulk send from the Leads table (50+ requires confirm), STOP/HELP and quiet hours handled automatically.',
        cta: { to: '/crm/chats', label: 'Open Chats' },
      },
      {
        id: 'crm_tour',
        title: '9. Your 4 daily stops',
        body: 'Leads → Pipeline → Chats → Calendar. That\'s the whole loop. Open a lead to see their full timeline (notes, presale activity, emails, SMS) in one place.',
        cta: { to: '/crm/leads', label: 'Open Leads' },
      },
    ],
  },
];

const FAQ = [
  {
    q: 'I skipped a step — how do I come back?',
    a: 'Either click "Resume" on the gold banner at the top of the dashboard, or hit the "Resume onboarding" button below.',
  },
  {
    q: 'How do I get added to the team CRM?',
    a: 'CRM access is invite-only. An admin will create your CRM login from Admin → Agent Onboarding. You don\'t request it — you simply log in once invited.',
  },
  {
    q: "I don't have a ReZen API key yet.",
    a: 'No problem — skip that step. You can connect ReZen any time from Settings → Integrations. Until then, add deals manually from the Deals page.',
  },
  {
    q: 'My headshot/signature is wrong.',
    a: 'Your identity syncs from Presale Properties on every login. Update it there once and it flows everywhere — CRM emails, project sends, agent landing pages.',
  },
];

export default function HelpOnboardingPage() {
  const { reopenWizard, percent, isComplete } = useOnboardingProgress();

  useEffect(() => {
    document.title = 'Day 1 Onboarding Playbook | dealzflow';
  }, []);

  return (
    <>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        <Button asChild variant="ghost" size="sm" className="mb-4 -ml-2 text-muted-foreground">
          <Link to="/dashboard"><ArrowLeft className="w-3.5 h-3.5 mr-1" /> Dashboard</Link>
        </Button>

        <header className="mb-8">
          <p className="text-[11px] uppercase tracking-[0.18em] text-primary/80 font-semibold mb-2">
            Onboarding Playbook
          </p>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-3">
            Get set up in a single day.
          </h1>
          <p className="text-base text-muted-foreground leading-relaxed">
            Two tracks. Same wizard. Workspace agents finish in 6 steps; team CRM members finish 3 more.
            Skip any step and come back any time.
          </p>

          {!isComplete && (
            <div className="mt-5 flex items-center gap-3 p-3.5 rounded-xl border border-primary/30 bg-primary/10">
              <Sparkles className="w-4 h-4 text-primary" />
              <span className="text-sm text-foreground/90 flex-1">
                You're <strong className="text-primary">{percent}%</strong> through onboarding.
              </span>
              <Button
                size="sm"
                onClick={async () => {
                  try { sessionStorage.removeItem('ob-wizard-snoozed-at'); } catch { /* ignore */ }
                  await reopenWizard();
                  window.dispatchEvent(new CustomEvent('onboarding:open'));
                }}
              >Resume wizard</Button>
            </div>
          )}
        </header>

        {SECTIONS.map((section) => (
          <section key={section.title} className="mb-10">
            <div className="flex items-center gap-3 mb-1">
              <div className="w-9 h-9 rounded-lg bg-primary/15 text-primary flex items-center justify-center">
                <section.icon className="w-4 h-4" />
              </div>
              <h2 className="text-xl font-bold">{section.title}</h2>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed mb-5 ml-12">{section.intro}</p>

            <ol className="space-y-3">
              {section.steps.map((s) => (
                <li
                  key={s.id}
                  className="p-4 sm:p-5 rounded-xl border border-border/60 bg-card/40"
                >
                  <h3 className="text-base font-bold text-foreground mb-1.5">{s.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{s.body}</p>
                  {s.cta && (
                    <Button asChild variant="outline" size="sm" className="mt-3 h-8 text-xs">
                      <Link to={s.cta.to}>{s.cta.label}</Link>
                    </Button>
                  )}
                </li>
              ))}
            </ol>
          </section>
        ))}

        <section className="mb-10">
          <h2 className="text-xl font-bold mb-4">FAQ</h2>
          <div className="space-y-3">
            {FAQ.map((f) => (
              <div key={f.q} className="p-4 rounded-xl border border-border/60 bg-card/40">
                <p className="text-sm font-semibold text-foreground mb-1">{f.q}</p>
                <p className="text-sm text-muted-foreground leading-relaxed">{f.a}</p>
              </div>
            ))}
          </div>
        </section>

        <footer className="text-xs text-muted-foreground text-center pb-10">
          Stuck on a step? Message your admin in the team chat — or read this guide again.
        </footer>
      </div>
    </>
  );
}
