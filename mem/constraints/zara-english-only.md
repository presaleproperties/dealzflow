---
name: Zara writes in English only
description: Zara (outbound + inbound replies + playbook simulator) ALWAYS writes in English. crm_contacts.language is internal metadata for human agents (so they know what to speak when calling) — never used to translate Zara's output.
type: constraint
---
Zara always replies/drafts in English regardless of `crm_contacts.language`. The language column is internal note for human agents (call language). Updated in `zara-plan-outbound`, `zara-reply`, `zara-simulate-playbook` system prompts + user messages. Do not re-introduce multilingual generation. **Why:** Uzair only wants English outbound; lead language is for in-person/phone context only.
