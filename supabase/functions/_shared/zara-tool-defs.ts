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
  },
  {
    name: "add_lead_note",
    description: "Append a note to a lead's profile (writes to crm_contacts.notes).",
    input_schema: {
      type: "object",
      properties: { contact_id: { type: "string" }, note: { type: "string" } },
      required: ["contact_id", "note"],
    },
  },
  {
    name: "add_lead_tag",
    description: "Add a tag to a lead.",
    input_schema: {
      type: "object",
      properties: { contact_id: { type: "string" }, tag: { type: "string" } },
      required: ["contact_id", "tag"],
    },
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
];
