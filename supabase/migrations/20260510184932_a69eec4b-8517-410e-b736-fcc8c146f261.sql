-- Seed 6 Presale signup-style funnels into crm_automations.
-- Each funnel = a sequence of send_email steps using Presale's two templates:
--   auto_project_details_docs (Template A — full project details + doc CTAs)
--   auto_agent_followup       (Template B — personal agent intro)

-- Helper: insert (or update) one automation + its ordered steps.
do $$
declare
  v_id uuid;
  rec record;
  funnels jsonb := '[
    {
      "slug": "presale-vip-registration",
      "name": "Presale · VIP Registration",
      "description": "Mirrors VIP signup flow on presaleproperties.com. Project details + agent intro cadence.",
      "steps": [
        {"order": 1, "delay_hours":   0, "template": "auto_project_details_docs"},
        {"order": 2, "delay_hours":  24, "template": "auto_agent_followup"},
        {"order": 3, "delay_hours":  72, "template": "auto_project_details_docs"},
        {"order": 4, "delay_hours": 168, "template": "auto_agent_followup"}
      ]
    },
    {
      "slug": "presale-floor-plan-request",
      "name": "Presale · Floor Plan Request",
      "description": "Mirrors floorplan download flow. Delivers project details, agent follow-up, then re-engagement.",
      "steps": [
        {"order": 1, "delay_hours":   0, "template": "auto_project_details_docs"},
        {"order": 2, "delay_hours":  24, "template": "auto_agent_followup"},
        {"order": 3, "delay_hours":  96, "template": "auto_project_details_docs"}
      ]
    },
    {
      "slug": "presale-project-inquiry",
      "name": "Presale · Project Inquiry",
      "description": "Mirrors generic project inquiry form. Project details first, agent intro day 2, deeper details day 5.",
      "steps": [
        {"order": 1, "delay_hours":   0, "template": "auto_project_details_docs"},
        {"order": 2, "delay_hours":  48, "template": "auto_agent_followup"},
        {"order": 3, "delay_hours": 120, "template": "auto_project_details_docs"}
      ]
    },
    {
      "slug": "presale-contact-form",
      "name": "Presale · Contact Form",
      "description": "Mirrors generic contact form. Agent acknowledgement first, project details day 2.",
      "steps": [
        {"order": 1, "delay_hours":   0, "template": "auto_agent_followup"},
        {"order": 2, "delay_hours":  48, "template": "auto_project_details_docs"}
      ]
    },
    {
      "slug": "presale-deck-revisit-hot",
      "name": "Presale · Deck Revisit (Hot)",
      "description": "Fires when a lead re-opens a deck. Personal nudge first, project details day 1, agent follow-up day 3.",
      "steps": [
        {"order": 1, "delay_hours":   0, "template": "auto_agent_followup"},
        {"order": 2, "delay_hours":  24, "template": "auto_project_details_docs"},
        {"order": 3, "delay_hours":  72, "template": "auto_agent_followup"}
      ]
    },
    {
      "slug": "presale-cold-lead",
      "name": "Presale · Cold Lead Nudge",
      "description": "For dormant leads. Light agent ping first, project details day 7, final nudge day 14.",
      "steps": [
        {"order": 1, "delay_hours":   0, "template": "auto_agent_followup"},
        {"order": 2, "delay_hours": 168, "template": "auto_project_details_docs"},
        {"order": 3, "delay_hours": 336, "template": "auto_agent_followup"}
      ]
    }
  ]'::jsonb;
  step jsonb;
begin
  for rec in select * from jsonb_array_elements(funnels) as f loop
    insert into crm_automations (slug, name, description, trigger_type, is_active)
    values (
      rec.value->>'slug',
      rec.value->>'name',
      rec.value->>'description',
      'manual_enroll',
      true
    )
    on conflict (slug) where slug is not null
    do update set
      name = excluded.name,
      description = excluded.description,
      trigger_type = excluded.trigger_type,
      is_active = true,
      updated_at = now()
    returning id into v_id;

    -- Replace steps cleanly so re-running this migration is idempotent.
    delete from crm_automation_steps where automation_id = v_id;

    for step in select * from jsonb_array_elements(rec.value->'steps') loop
      insert into crm_automation_steps (
        automation_id, step_order, action_type, delay_hours, action_config
      ) values (
        v_id,
        (step->>'order')::int,
        'send_email',
        (step->>'delay_hours')::int,
        jsonb_build_object(
          'channel', 'email',
          'template_slug', step->>'template'
        )
      );
    end loop;
  end loop;
end $$;