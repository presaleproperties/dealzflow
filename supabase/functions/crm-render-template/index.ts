// Tier 4 — Server-side template variable renderer.
//
// Renders {{var}} / {$var} / ${var} tokens against:
//   • LEAD context — fetched from crm_contacts by lead_id (admin client; RLS-
//     checked by the upstream caller via a separate visibility query)
//   • SENDER context — resolved from auth.uid() of the calling user:
//       agent_name/email/phone/calendly/signature/photo from crm_team or
//       profiles, NEVER from the lead's assigned_to.
//
// This is the function that satisfies Tier 4 acceptance E:
//   "Agent X sending from Uzair-owned lead must render Agent X."
//
// Request:  { text: string, subject?: string, lead_id?: string|null,
//             channel: 'email' | 'sms' }
// Response: { text: string, subject: string|null, sender: {...} }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Sender {
  agent_name: string;
  agent_email: string;
  agent_phone: string;
  agent_calendly: string;
  agent_signature: string;
  agent_photo: string;
}

interface LeadCtx {
  first_name: string;
  last_name: string;
  full_name: string;
  email: string;
  phone: string;
  project: string;
  address: string;
  city: string;
  pipeline_status: string;
}

const EMPTY_LEAD: LeadCtx = {
  first_name: '', last_name: '', full_name: '',
  email: '', phone: '', project: '', address: '',
  city: '', pipeline_status: '',
};

const EMPTY_SENDER: Sender = {
  agent_name: '', agent_email: '', agent_phone: '',
  agent_calendly: '', agent_signature: '', agent_photo: '',
};

function toLeadCtx(row: any): LeadCtx {
  if (!row) return EMPTY_LEAD;
  const first = (row.first_name ?? '').toString().trim();
  const last  = (row.last_name  ?? '').toString().trim();
  return {
    first_name: first,
    last_name:  last,
    full_name:  [first, last].filter(Boolean).join(' '),
    email:      row.email ?? '',
    phone:      row.phone ?? '',
    project:    row.project_interest ?? row.project ?? '',
    address:    row.address ?? '',
    city:       row.city ?? '',
    pipeline_status: row.pipeline_status ?? row.status ?? '',
  };
}

function render(text: string, lead: LeadCtx, sender: Sender): string {
  if (!text) return '';
  const map: Record<string, string> = { ...lead, ...sender };
  // Legacy aliases per project memory (email-merge-syntax)
  map.name = lead.first_name || lead.full_name;
  map.agent = sender.agent_name;

  // Supports {{token}}, {$token}, and ${token}
  return text.replace(
    /\{\{\s*([a-zA-Z_][\w.]*)\s*\}\}|\{\$\s*([a-zA-Z_][\w.]*)\s*\}|\$\{\s*([a-zA-Z_][\w.]*)\s*\}/g,
    (_m, a, b, c) => {
      const key = (a ?? b ?? c) as string;
      const v = map[key];
      return v == null ? '' : String(v);
    },
  );
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing Authorization' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json().catch(() => ({}));
    const text: string = (body?.text ?? '').toString();
    const subject: string | null = body?.subject == null ? null : body.subject.toString();
    const leadId: string | null = body?.lead_id ?? null;

    // Resolve SENDER from the calling user — NEVER from the lead.
    // Prefer crm_team (team display + Presale snapshot), fall back to profiles.
    let sender: Sender = { ...EMPTY_SENDER };

    const { data: team } = await supabase
      .from('crm_team')
      .select('display_name, email, phone, calendly_url, presale_snapshot, photo_url')
      .eq('user_id', user.id)
      .maybeSingle();

    if (team) {
      const snap = (team.presale_snapshot ?? {}) as any;
      sender.agent_name      = team.display_name ?? snap.full_name ?? '';
      sender.agent_email     = team.email ?? snap.email ?? user.email ?? '';
      sender.agent_phone     = team.phone ?? snap.phone ?? '';
      sender.agent_calendly  = team.calendly_url ?? snap.calendly_url ?? '';
      sender.agent_photo     = team.photo_url ?? snap.headshot_url ?? '';
      sender.agent_signature = snap.signature_html ?? '';
    }
    if (!sender.agent_name) {
      const { data: prof } = await supabase
        .from('profiles')
        .select('first_name, last_name, email, phone')
        .eq('id', user.id)
        .maybeSingle();
      if (prof) {
        sender.agent_name  = [prof.first_name, prof.last_name].filter(Boolean).join(' ') || sender.agent_name;
        sender.agent_email = prof.email ?? sender.agent_email;
        sender.agent_phone = prof.phone ?? sender.agent_phone;
      }
    }
    if (!sender.agent_email) sender.agent_email = user.email ?? '';

    // Resolve LEAD context. RLS naturally limits what this user can see.
    let lead: LeadCtx = EMPTY_LEAD;
    if (leadId) {
      const { data: row } = await supabase
        .from('crm_contacts')
        .select('first_name, last_name, email, phone, address, city, status, pipeline_status, project_interest')
        .eq('id', leadId)
        .maybeSingle();
      lead = toLeadCtx(row);
    }

    return new Response(JSON.stringify({
      text: render(text, lead, sender),
      subject: subject == null ? null : render(subject, lead, sender),
      sender,
      lead,
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
