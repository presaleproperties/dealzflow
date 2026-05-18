// Anthropic tool definitions for Zara (19 tools).
// Keep schemas narrow and descriptions actionable.

export type ZaraTool = {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
  // Tools that mutate state require an explicit confirm round-trip from the user.
  needs_approval?: boolean;
};

export const ZARA_TOOLS: ZaraTool[] = [
  {
    name: "get_lead_context",
    description:
      "Load a single lead's full context: contact card, recent activity, tags, engagement, and any project_interest. Use whenever the user names a lead or asks 'what's going on with X'.",
    input_schema: {
      type: "object",
      properties: {
        contact_id: { type: "string", description: "crm_contacts.id (uuid)" },
        name_or_email: { type: "string", description: "Fallback when no id known" },
      },
    },
  },
  {
    name: "search_leads",
    description:
      "Search crm_contacts by name, email, phone, tag, status, or pipeline. Returns up to 25 lightweight rows.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string" },
        status: { type: "string" },
        tag: { type: "string" },
        limit: { type: "number" },
      },
    },
  },
  {
    name: "update_lead",
    description:
      "Propose an update to a lead (name, phone, email, status, notes, etc). Returns a pending change for user confirmation — never writes directly. Pair with confirm_update_lead.",
    input_schema: {
      type: "object",
      properties: {
        contact_id: { type: "string" },
        patch: { type: "object", description: "Field/value pairs to update" },
        reason: { type: "string" },
      },
      required: ["contact_id", "patch"],
    },
    needs_approval: true,
  },
  {
    name: "confirm_update_lead",
    description:
      "Commit a previously-proposed update_lead change. Pass the pending_id returned by update_lead.",
    input_schema: {
      type: "object",
      properties: { pending_id: { type: "string" } },
      required: ["pending_id"],
    },
  },
  {
    name: "draft_email",
    description:
      "Draft an email to a lead. The body you pass is COPY only — the executor sends it to Presale Properties auto-templates for the final branded render and agent signature. Never create, save, update, or select CRM email templates. Pass `purpose` as the intent: greeting | first_touch | follow_up | reactivation | neighborhood | project_info | newsletter | market_update | project_match | send_project_details. SMS/WhatsApp drafts stay plain text; email becomes Presale-rendered HTML.",
    input_schema: {
      type: "object",
      properties: {
        contact_id: { type: "string" },
        subject: { type: "string" },
        body: { type: "string", description: "Plain copy (paragraphs separated by blank lines). Do NOT pass raw HTML — the executor wraps it." },
        purpose: { type: "string", description: "Intent key — drives Presale auto-template selection." },
        cta_text: { type: "string", description: "Optional CTA button label." },
        cta_url: { type: "string", description: "Optional CTA destination URL." },
      },
      required: ["contact_id", "body"],
    },
    needs_approval: true,
  },
  {
    name: "draft_sms",
    description:
      "Draft an SMS to a lead. Adds to the approval queue. Respects zara_enabled.",
    input_schema: {
      type: "object",
      properties: {
        contact_id: { type: "string" },
        body: { type: "string" },
      },
      required: ["contact_id", "body"],
    },
    needs_approval: true,
  },
  {
    name: "draft_whatsapp",
    description:
      "Draft a WhatsApp message to a lead. Adds to the approval queue. NOTE: WhatsApp sending is currently disabled (no Meta wire-up) — the draft will queue but not fire automatically.",
    input_schema: {
      type: "object",
      properties: {
        contact_id: { type: "string" },
        body: { type: "string" },
      },
      required: ["contact_id", "body"],
    },
    needs_approval: true,
  },
  {
    name: "add_lead_note",
    description: "Append a note to a lead's profile (writes to crm_contacts.notes).",
    input_schema: {
      type: "object",
      properties: { contact_id: { type: "string" }, note: { type: "string" } },
      required: ["contact_id", "note"],
    },
    needs_approval: true,
  },
  {
    name: "add_lead_tag",
    description: "Add a tag to a lead.",
    input_schema: {
      type: "object",
      properties: { contact_id: { type: "string" }, tag: { type: "string" } },
      required: ["contact_id", "tag"],
    },
    needs_approval: true,
  },
  {
    name: "set_lead_status",
    description:
      "Update a lead's status (writes crm_contacts.status). Valid values: new, contacted, qualified, nurture, hot, cold, closed, lost.",
    input_schema: {
      type: "object",
      properties: { contact_id: { type: "string" }, status: { type: "string" } },
      required: ["contact_id", "status"],
    },
    needs_approval: true,
  },
  {
    name: "schedule_follow_up",
    description:
      "Create a follow-up task for a lead at a future timestamp (inserts into crm_tasks).",
    input_schema: {
      type: "object",
      properties: {
        contact_id: { type: "string" },
        due_at: { type: "string", description: "ISO 8601" },
        note: { type: "string" },
      },
      required: ["contact_id", "due_at"],
    },
    needs_approval: true,
  },
  {
    name: "list_pending_drafts",
    description:
      "List Zara's pending drafts (zara_suggested_replies where status='pending'). Optional limit.",
    input_schema: {
      type: "object",
      properties: { limit: { type: "number" } },
    },
  },
  {
    name: "approve_draft",
    description:
      "Approve a pending draft so it sends. Wraps a queue row state transition; the agent still owns the decision in the queue UI — this is a convenience.",
    input_schema: {
      type: "object",
      properties: { draft_id: { type: "string" } },
      required: ["draft_id"],
    },
    needs_approval: true,
  },
  {
    name: "send_briefing_summary",
    description:
      "Produce today's agent briefing — counts of hot leads, pending drafts, follow-ups due, recent activity. Returns structured JSON for the assistant to summarize.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "list_projects",
    description:
      "List/search crm_projects (synced from PresaleProperties.com — source of truth). Supports name/slug search via `q`, optional city/status filter, and offset+limit pagination (default 50, max 500). Returns { projects, total, offset, limit, has_more }. If the local sync is missing a freshly-launched project (e.g. searching by name returns <3 hits), the tool transparently falls back to the Presale bridge so Zara never misses a project. To page through everything, increment `offset` by `limit` until `has_more` is false.",
    input_schema: {
      type: "object",
      properties: {
        q: { type: "string", description: "Free-text name/slug search (case-insensitive). Example: 'eden by zentera'." },
        city: { type: "string" },
        status: { type: "string", description: "Filter by status (e.g. 'active', 'sold_out')." },
        limit: { type: "number", description: "Page size (1–500, default 50)." },
        offset: { type: "number", description: "Skip N rows for pagination." },
      },
    },
  },
  {
    name: "project_details",
    description: "Fetch one project from crm_projects by slug or id.",
    input_schema: {
      type: "object",
      properties: { slug: { type: "string" }, id: { type: "string" } },
    },
  },
  {
    name: "recommend_projects_for_lead",
    description:
      "Recommend up to 5 projects that fit a lead (matches city + budget + bedrooms + tags). Returns scored list.",
    input_schema: {
      type: "object",
      properties: { contact_id: { type: "string" } },
      required: ["contact_id"],
    },
  },
  {
    name: "web_research",
    description:
      "Cached web research for context (e.g., market news, a project's developer). Cache TTL ~24h via zara_research_cache.",
    input_schema: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
    },
  },
  {
    name: "log_training_feedback",
    description:
      "Record user feedback (thumbs up/down + optional note) on an assistant message into zara_training_feedback.",
    input_schema: {
      type: "object",
      properties: {
        message_id: { type: "string" },
        rating: { type: "string", enum: ["up", "down"] },
        note: { type: "string" },
      },
      required: ["message_id", "rating"],
    },
  },
  {
    name: "show_engagement_score",
    description:
      "Return the engagement score (0-100) + tier for a contact, plus the most recent contributing events.",
    input_schema: {
      type: "object",
      properties: { contact_id: { type: "string" } },
      required: ["contact_id"],
    },
  },

  // ── RAG tools (Zara Brain) ────────────────────────────────────────────
  {
    name: "search_knowledge",
    description:
      "Explicit semantic search across Uzair's knowledge base (playbooks, scripts, FAQs, brand voice). Use when the user asks 'what do my playbooks say about…' or to ground a draft in stored material.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string" },
        top_k: { type: "number", description: "Default 5, max 10" },
        type: { type: "string", description: "Optional filter: playbook | script | faq | brand_voice | project_brief | market_intel | training_note" },
      },
      required: ["query"],
    },
  },
  {
    name: "get_winning_pattern",
    description:
      "Find the top winning conversations that match a scenario (lead profile, situation, objection). Returns initial situation, turning message, and why it worked. Use when the user asks 'show me how I closed cold investor leads' or before drafting a reply that needs a proven pattern.",
    input_schema: {
      type: "object",
      properties: { scenario: { type: "string" } },
      required: ["scenario"],
    },
  },
  {
    name: "get_project_deep_dive",
    description:
      "Pull Uzair's deep-dive notes for a project (uzair_pitch, common_objections, honest_caveats, who_this_fits, mortgage_broker_note). Use BEFORE pitching a project — always cite caveats first.",
    input_schema: {
      type: "object",
      properties: {
        project_slug: { type: "string" },
        project_id: { type: "string" },
      },
    },
  },
  {
    name: "get_market_context",
    description:
      "Return the most recent market_intel rows (REBGV-style stats) for an area or building type, ordered by week. Use for grounding any market claim in actual data.",
    input_schema: {
      type: "object",
      properties: {
        area: { type: "string" },
        building_type: { type: "string" },
        weeks_back: { type: "number", description: "Default 4" },
      },
    },
  },

  // ── Phase 4 tools (booking, pricing, attachments, smart follow-up, enrichment) ──
  {
    name: "book_calendly",
    description:
      "Return the assigned agent's Calendly/booking URL for a lead and (optionally) draft an email or SMS with the link. Use when the lead asks to meet, book a tour, or jump on a call. If draft_channel is omitted, only the URL is returned.",
    input_schema: {
      type: "object",
      properties: {
        contact_id: { type: "string" },
        draft_channel: { type: "string", enum: ["email", "sms", "whatsapp"], description: "Optional: also create a pending draft with the link" },
        message: { type: "string", description: "Optional custom blurb to wrap around the link" },
      },
      required: ["contact_id"],
    },
    needs_approval: true,
  },
  {
    name: "get_pricing",
    description:
      "Pull the latest pricing for a project (price range, starting PSF, deposit structure, pricing PDF URL). Checks presale_projects first, then crm_projects. Use BEFORE quoting any number to a lead.",
    input_schema: {
      type: "object",
      properties: {
        project_slug: { type: "string" },
        project_id: { type: "string" },
        project_name: { type: "string", description: "Fuzzy match fallback" },
      },
    },
  },
  {
    name: "attach_floorplan",
    description:
      "Return the floor-plans URL for a project so it can be attached to a draft. Optionally creates an email draft that includes the link.",
    input_schema: {
      type: "object",
      properties: {
        project_slug: { type: "string" },
        project_id: { type: "string" },
        project_name: { type: "string" },
        contact_id: { type: "string", description: "If set with draft=true, will create a pending email draft" },
        draft: { type: "boolean", description: "Default false. When true, also drafts an email with the link." },
      },
    },
    needs_approval: false,
  },
  {
    name: "get_floor_plans",
    description:
      "List private floor plans for a project and return short-lived signed download URLs (default 5 min TTL). Use this when a visitor wants confidential floorplan PDFs that aren't published publicly. Each item: { name, bedrooms, bathrooms, sqft, price_from, url, expires_in }.",
    input_schema: {
      type: "object",
      properties: {
        project_slug: { type: "string", description: "Project slug from crm_projects (required)." },
        bedrooms: { type: "number", description: "Optional filter — only return plans matching this bedroom count." },
        max: { type: "integer", description: "Max plans to return (default 12)." },
        ttl_seconds: { type: "integer", description: "Signed URL lifetime in seconds (60-3600, default 300)." },
      },
      required: ["project_slug"],
    },
    needs_approval: false,
  },
  {
    name: "send_brochure",
    description:
      "Return the public brochure / pitch-deck URL for a project so it can be shared in chat (or attached to an email draft). Pulls from crm_projects.brochure_url first, then falls back to the Presale bridge (pitch_deck_url / brochure_files). Use this when a visitor asks for the brochure, deck, or info package. Does NOT send email — share the link in your reply.",
    input_schema: {
      type: "object",
      properties: {
        project_slug: { type: "string" },
        project_id: { type: "string" },
        project_name: { type: "string", description: "Fuzzy match fallback" },
      },
    },
    needs_approval: false,
  },
  {
    name: "schedule_follow_up_smart",
    description:
      "Schedule a follow-up at an engagement-aware default time (hot=1 day, warm=3 days, cold=7 days) unless due_at is provided. Inserts into crm_tasks and tags the task with the chosen cadence.",
    input_schema: {
      type: "object",
      properties: {
        contact_id: { type: "string" },
        note: { type: "string" },
        due_at: { type: "string", description: "Optional ISO 8601 override" },
        cadence: { type: "string", enum: ["auto", "hot", "warm", "cold"], description: "Default 'auto' (uses engagement tier)" },
      },
      required: ["contact_id"],
    },
    needs_approval: true,
  },
  {
    name: "enrich_lead",
    description:
      "Pull a 360° dossier on a lead: contact card, all linked identities (emails/phones), engagement score + tier, recent activity, tags, project interests, and Zara's rolling memory facts. Use to brief yourself before any major action.",
    input_schema: {
      type: "object",
      properties: { contact_id: { type: "string" } },
      required: ["contact_id"],
    },
  },

  // ── Public-site tools (used by zara-public-chat) ──────────────────────
  {
    name: "capture_lead",
    description:
      "Create or upsert a CRM lead from a website visitor's volunteered info (name, email, phone, intent, project interest). Idempotent via identity resolution. Use the moment a visitor shares email or phone — BEFORE sending floor plans, deck, or booking links. Adds tags 'presale-website' and 'zara-public-chat'.",
    input_schema: {
      type: "object",
      properties: {
        email: { type: "string" },
        phone: { type: "string" },
        first_name: { type: "string" },
        last_name: { type: "string" },
        project_slug: { type: "string", description: "If the visitor is interested in a specific project." },
        intent: { type: "string", enum: ["buy", "invest", "browse", "sell"] },
        timeframe: { type: "string", enum: ["0-3m", "3-6m", "6-12m", "12m+"] },
        budget_max: { type: "number" },
        bedrooms_preferred: { type: "string" },
        language: { type: "string" },
        message: { type: "string", description: "Free-text note from the visitor — appended to lead notes." },
        presale_user_id: { type: "string", description: "Anonymous browser id; used to stitch prior page activity." },
      },
    },
  },
  {
    name: "get_unit_availability",
    description:
      "Check real-time selling status, unit types, and unit count for a project. Returns the project's current status (pre_launch | selling | sold_out | completed), unit_types, unit_count, completion year/quarter. Use BEFORE telling a visitor a project is available.",
    input_schema: {
      type: "object",
      properties: {
        project_slug: { type: "string" },
        project_id: { type: "string" },
      },
    },
  },
  {
    name: "escalate_to_human",
    description:
      "Ping the assigned agent (or owner+admins if unassigned) with a short transcript snippet and the reason for escalation. Use when the visitor wants to speak to a human, is in distress, asks something Zara cannot answer, or shows very high intent (ready to buy, asking about deposit wiring, etc).",
    input_schema: {
      type: "object",
      properties: {
        contact_id: { type: "string", description: "Captured lead id (call capture_lead first if you have email/phone)." },
        reason: { type: "string", description: "Short reason — what they need." },
        transcript_snippet: { type: "string", description: "Last 1-3 visitor messages, plain text." },
        urgency: { type: "string", enum: ["low", "medium", "high"], description: "Default medium." },
      },
      required: ["reason"],
    },
  },

  // ── Website Intelligence Layer ────────────────────────────────────────
  {
    name: "get_lead_website_behavior",
    description:
      "Read a lead's PresaleProperties.com website behaviour: project views, repeat visits, floor-plan downloads, pricing sheet requests, brochure downloads, calculator usage, comparison views, assignment page views, buyer-guide / blog / city-page views, booking starts/abandons, CTA clicks. Aggregates `crm_activity_events` (incl. nested `behavior_batch.metadata.behavior.{views,sessions,forms}`). Use BEFORE drafting any follow-up to a website lead so the message references what they actually did. Falls back to the Presale bridge `getLeadBehavior` if there are no local events.",
    input_schema: {
      type: "object",
      properties: {
        contact_id: { type: "string" },
        email: { type: "string" },
        phone: { type: "string" },
        since_days: { type: "number", description: "Default 90." },
        types: { type: "array", items: { type: "string" }, description: "Optional event type filter." },
      },
    },
  },
  {
    name: "search_website_content",
    description:
      "Semantic search over crawled PresaleProperties.com content (buyer guides, assignment pages, city pages, calculator pages, comparison pages, blog posts, process pages). Use when a lead asks about the buying process, assignment sales, deposit timing, calculators, or anything described on the website itself. Distinct from `search_knowledge` which is for internal playbooks.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string" },
        types: {
          type: "array",
          items: { type: "string", enum: ["buyer_guide", "assignment_page", "city_page", "calculator", "comparison", "blog_post", "process_page"] },
        },
        top_k: { type: "number", description: "Default 5, max 10." },
      },
      required: ["query"],
    },
  },
  {
    name: "lookup_topic",
    description:
      "Verified-data dispatcher used when you would otherwise quote pricing, deposits, incentives, completion, unit counts, floor plans, or availability. Routes to the correct structured tool (get_pricing / get_unit_availability / project_details / get_floor_plans / attach_floorplan) and returns either verified data or `{status:'unavailable', reason, action_for_agent}`. If a draft you produce contains a `{LOOKUP: topic}` placeholder, call this tool to resolve it BEFORE the draft is finalized.",
    input_schema: {
      type: "object",
      properties: {
        topic: {
          type: "string",
          enum: ["pricing", "deposit_structure", "incentives", "availability", "completion_date", "unit_count", "unit_types", "floor_plans", "assignment_rules", "brochure"],
        },
        project_slug: { type: "string" },
        project_id: { type: "string" },
        project_name: { type: "string", description: "Fuzzy fallback." },
        contact_id: { type: "string", description: "Optional — logged with the lookup miss if data is stale/missing." },
      },
      required: ["topic"],
    },
  },
];

