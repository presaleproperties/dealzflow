# Shared Lead + Behavior Schema (Presale Properties ↔ CRM)

This is the **canonical contract** between Presale Properties and the CRM.
When you collect a signup or behavior event on Presale, post it to:

```
POST https://svbilqvudkkdhslxebce.supabase.co/functions/v1/bridge-ingest-lead
Headers:
  x-bridge-secret: <BRIDGE_SECRET>
  Content-Type: application/json
```

## Lead payload (mirrors CRM `crm_contacts`)

```ts
{
  lead: {
    // ── Identity ────────────────────────────────────────
    email: string;                  // required, lowercased server-side
    first_name?: string;
    last_name?: string;
    phone?: string;
    presale_user_id?: string;       // auth.users.id from Presale — used for stable dedupe

    // ── Source / attribution ────────────────────────────
    source?: string;                // default: "presale-website"
    campaign_source?: string;       // utm_campaign or named campaign
    referral_source?: string;       // referrer slug

    // ── Project interest ────────────────────────────────
    project?: string;               // single project name (back-compat)
    projects?: string[];            // preferred — multiple project names

    // ── Signup form fields (mirror Presale signup) ──────
    intent?: 'buy' | 'invest' | 'browse' | 'sell';
    timeframe?: '0-3m' | '3-6m' | '6-12m' | '12m+';
    home_type_pref?: 'condo' | 'townhome' | 'detached' | 'any';
    looking_to_buy_in?: string[];   // cities / neighbourhoods
    budget_min?: number;
    budget_max?: number;
    bedrooms_preferred?: string;    // "1", "2", "3+", etc.
    is_pre_approved?: boolean;
    language?: string;              // 'en' | 'zh' | 'pa' | ...
    city?: string;
    province?: string;              // default 'BC'
    postal_code?: string;
    marketing_consent?: boolean;
    signup_completed_at?: string;   // ISO timestamp

    tags?: string[];                // free-form, e.g. ["vip","investor"]
    metadata?: Record<string, any>; // anything else — stored in presale_metadata jsonb
  },

  behavior?: {
    views?: Array<{
      property_id?: string;
      property_name?: string;
      property_url?: string;
      action?: 'view' | 'favorite' | 'share';
      duration_seconds?: number;
      viewed_at?: string;           // ISO
      metadata?: any;
    }>;
    engagement?: Array<{
      event_type: 'email_open' | 'email_click' | 'email_unsubscribe'
                | 'email_bounce' | 'template_view' | 'page_click' | 'button_click';
      template_id?: string;
      template_name?: string;
      campaign_id?: string;
      campaign_name?: string;
      link_url?: string;
      occurred_at?: string;
      metadata?: any;
    }>;
    forms?: Array<{
      form_type: 'signup_started' | 'signup_step_1' | 'signup_step_2' | 'signup_step_3'
               | 'signup_completed' | 'signup_abandoned' | 'brochure_download'
               | 'floor_plan' | 'tour_request' | 'newsletter' | 'contact';
      form_name?: string;
      property_id?: string;
      property_name?: string;
      funnel_step?: number;
      funnel_total_steps?: number;
      payload?: any;
      submitted_at?: string;
    }>;
    sessions?: Array<{
      session_id?: string;
      pages_viewed?: number;
      duration_seconds?: number;
      landing_page?: string;
      exit_page?: string;
      referrer?: string;
      utm_source?: string;
      utm_medium?: string;
      utm_campaign?: string;
      device_type?: 'mobile' | 'tablet' | 'desktop';
      started_at?: string;
      ended_at?: string;
    }>;
  }
}
```

## Dedup & merge rules

1. Match on `presale_user_id` first (most stable).
2. Else match on `email` (case-insensitive) **OR** `phone` (digits only).
3. **Merge**: blanks are filled; tags / projects / `looking_to_buy_in` are appended (unique);
   `presale_metadata` is shallow-merged. Never overwrites manual CRM edits.

## Response

```json
{ "ok": true, "contact_id": "<uuid>", "action": "created" | "merged" }
```
