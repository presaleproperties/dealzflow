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
      "Draft an email to a lead. Adds to the approval queue (zara_suggested_replies). Respects the zara_enabled gate. Returns the draft id and preview.",
    input_schema: {
      type: "object",
      properties: {
        contact_id: { type: "string" },
        subject: { type: "string" },
        body: { type: "string", description: "Markdown or HTML body" },
        purpose: { type: "string" },
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
    name: "create_template",
    description:
      "Save a reusable message template. Use when the agent says 'save that as a template called X'. channel='email' writes to crm_email_templates; channel='sms' writes to crm_sms_templates; channel='whatsapp' writes to crm_whatsapp_templates.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        channel: { type: "string", enum: ["email", "sms", "whatsapp"] },
        subject: { type: "string", description: "Required for email." },
        body: { type: "string" },
        tags: { type: "array", items: { type: "string" } },
      },
      required: ["title", "channel", "body"],
    },
    needs_approval: true,
  },
  {
    name: "update_template",
    description:
      "Update an existing template. Provide template_id and fields_to_update (subject/body/title/tags).",
    input_schema: {
      type: "object",
      properties: {
        template_id: { type: "string" },
        channel: { type: "string", enum: ["email", "sms", "whatsapp"] },
        fields_to_update: { type: "object" },
      },
      required: ["template_id", "fields_to_update"],
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
      "List crm_projects with optional city filter. Returns name, slug, city, status, key_specs.",
    input_schema: {
      type: "object",
      properties: { city: { type: "string" }, limit: { type: "number" } },
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
];
