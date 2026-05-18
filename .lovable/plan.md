# Zara Website Intelligence Extraction Layer

## What's already in place (verified)
- **Project inventory**: `crm_projects` (slug/city/neighborhood/developer/property_type/price_from-to/completion_date/bedrooms_offered/brochure/floorplans/pricing URLs/hero_image) + `presale_projects` extended (unit_types, unit_count, deposit_structure, completion_year/quarter, status, vip_access, key_features, uzair_pitch, caveats, fit profile). Daily sync from Presale via `sync-presale-projects`.
- **Lead context**: `crm_contacts` + identities + tags + assigned agent + project_interest. Tools `get_lead_context`, `enrich_lead`, `recommend_projects_for_lead`, `capture_lead` already exist.
- **Behaviour ingest**: `bridge-ingest-behavior` + `receive-presale-activity` write to `crm_activity_events` (type, contact_id, project_slug, metadata, occurred_at).
- **RAG store**: `zara_knowledge_documents` + `zara_knowledge_chunks` for playbooks/scripts/FAQs, queried via `search_knowledge`.
- **Existing tools (partial coverage)**: list_projects, project_details, get_pricing, get_floor_plans, get_unit_availability, send_brochure, attach_floorplan, get_project_deep_dive, capture_lead, escalate_to_human.

## What's missing (the gaps this build closes)

### 1. Project inventory completeness
Add two missing columns on `crm_projects` + `presale_projects`:
- `incentives` (jsonb — list of current incentives: VIP bonus, deposit defer, decor credit, etc.)
- `assignment_rules` (text — "no assignments / closing-only / open after deposit 2", etc.)

Surface in `list_projects` and `project_details` responses, and include in `get_pricing` so the never-quote guardrail can pull verified incentive data.

### 2. Website behaviour query tool (currently NO read-side tool exists)
New tool **`get_lead_website_behavior`** with input `{contact_id?, email?, phone?, since_days?, types?[]}` returning a structured summary from `crm_activity_events`:
- page_views, project_views (per slug, with count + last viewed)
- repeat_visits (sessions in last 30d)
- floor_plan_downloads, pricing_sheet_requests, brochure_downloads
- calculator_usage (mortgage/deposit), comparison_page_views
- assignment_page_views, buyer_guide_views, blog_views, city_page_views
- booking_starts, booking_abandons, CTA clicks
- raw_timeline (last 20 events for transparency)

Falls back to Presale bridge `getLeadBehavior` when contact has no local events yet.

### 3. Content intelligence layer (currently NO content access)
Two-part:

**a. Crawler edge fn `presale-content-sync`** (admin/cron, daily). Pulls PresaleProperties.com sitemap and selectively ingests:
- buyer guides / process pages
- assignment sales pages
- city pages (Fraser Valley)
- mortgage/deposit calculator descriptions
- comparison pages
- blog posts (last 90 days)

Writes to `zara_knowledge_documents` with `type` in `('buyer_guide','assignment_page','city_page','calculator','comparison','blog_post','process_page')`, `source_url`, `title`, `last_crawled_at`. Reuses existing chunk+embed pipeline (`zara-embed`/`zara-process-embed-queue`).

**b. New tool `search_website_content`** — semantic search over `zara_knowledge_documents` filtered to website types. Distinct from `search_knowledge` (which is for internal playbooks) so Zara picks the right corpus.

### 4. Never-Quote Guardrails + `{LOOKUP: topic}` convention
Update `_shared/zara-guardrails.ts:ZARA_BASE_PROMPT` with a hard block:

> NEVER quote prices, deposit structures, incentives, availability, completion dates, or unit counts from memory. ALWAYS call `get_pricing`, `get_unit_availability`, `project_details`, or `attach_floorplan` first. If a tool returns missing/stale data, leave a `{LOOKUP: <topic>}` placeholder in the draft and add a note for the agent.

Add tool **`lookup_topic`** as a unified dispatcher — agent or downstream prompt can call `lookup_topic({topic:'incentives', project_slug:'eden'})` and it routes to the right structured fetch (pricing / availability / floor plans / incentives / completion). Returns either verified data or `{status:'unavailable', reason, action_for_agent}`.

In `zara-chat` and `zara-public-chat`, post-process outbound drafts: scan for `{LOOKUP:...}` placeholders and either auto-resolve via `lookup_topic` or block send and flag the draft.

### 5. Relationship logic prompt update
Extend `ZARA_BASE_PROMPT` "OUTBOUND VOICE" section to require Zara to pull `get_lead_website_behavior` + `get_lead_context` + `recommend_projects_for_lead` before drafting any follow-up to a website lead, and to weave in (without quoting numbers): what they viewed, which floorplans they downloaded, what they compared, plus their emotional state cue from message tone.

### 6. Admin visibility (lightweight)
Add a `/crm/zara/intelligence` admin pane showing:
- Project data freshness (last_synced_at per project, count of projects missing pricing / floorplans / incentives)
- Website content freshness (counts per type, oldest crawl)
- Behaviour event volume last 7d (events/day, top events)
- "Lookup misses" — surface `{LOOKUP: ...}` placeholders flagged by guardrails

## Technical changes (files / migrations)

| Area | Change |
|---|---|
| Migration | `ALTER TABLE crm_projects ADD COLUMN incentives jsonb DEFAULT '[]', assignment_rules text;` same on `presale_projects`. New table `zara_lookup_misses(id, topic, project_slug, contact_id, created_at)`. |
| Edge fn (new) | `presale-content-sync` (sitemap → fetch → embed queue) |
| Edge fn (new) | `zara-tool-get-lead-website-behavior` (or inline in `zara-tool-execute`) |
| Edge fn (new) | `zara-tool-lookup-topic` (inline) |
| Edge fn (new) | `zara-tool-search-website-content` (inline) |
| `_shared/zara-tool-defs.ts` | Add 4 new tool definitions |
| `zara-tool-execute/index.ts` | Add handlers for the 4 new tools |
| `_shared/zara-guardrails.ts` | NEVER-QUOTE block + `{LOOKUP: topic}` convention + website-context preamble |
| `zara-chat/index.ts` + `zara-public-chat/index.ts` | Post-process drafts: detect `{LOOKUP:}`, auto-resolve via `lookup_topic`, log unresolved misses |
| Frontend | `/crm/zara/intelligence` admin pane (data freshness + lookup misses) |
| Cron | `presale-content-sync` daily at 03:00 UTC (off-peak, after projects sync at 05:00) |

## Out of scope (explicit)
- Editing Presale-side bridge endpoints. The crawler reads public HTML; we don't depend on Presale shipping new endpoints.
- Backfilling old behaviour events — we only enhance forward.
- Calculator interactive embed inside Zara — she'll reference, not replicate.

## Acceptance checks (post-build)
1. Run `get_lead_website_behavior` on a known active website lead → returns project views + downloads + last-7-day session counts.
2. Ask Zara "what's the deposit on Eden by Zentera?" → she calls `get_pricing` (verified data) or returns `{LOOKUP: deposit_structure}` not a fabricated number.
3. Ask Zara "summarize our buyer process page" → she calls `search_website_content` and answers grounded in crawled content.
4. Admin `/crm/zara/intelligence` shows >0 buyer_guides and city_pages crawled, and lists any unresolved `{LOOKUP:}` misses from the last 7d.

Approve and I'll execute the migration first, then ship the edge fns + prompt updates + admin pane.
