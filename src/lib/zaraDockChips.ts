import type { ZaraSurface } from '@/hooks/useZaraPageContext';

export type ZaraChip = {
  label: string;
  prompt: string;
  /** When true, the chip implicitly relies on contact_id from page context. */
  needsContact?: boolean;
};

const CHIPS: Record<ZaraSurface, ZaraChip[]> = {
  dashboard: [
    { label: 'Morning briefing', prompt: 'Give me my morning briefing.' },
    { label: 'What needs my attention?', prompt: 'What needs my attention right now?' },
    { label: 'Hot leads', prompt: 'Show me my hot leads.' },
    { label: "Today's wins", prompt: "Summarise today's wins." },
  ],
  leads_list: [
    { label: 'Show cold leads', prompt: 'Show me my cold leads.' },
    { label: 'Show hot leads', prompt: 'Show me my hot leads.' },
    { label: 'Stale 14+ days', prompt: 'Which of my leads have gone stale for 14+ days?' },
    { label: 'New this week', prompt: 'Which new leads came in this week?' },
  ],
  lead_detail: [
    { label: 'Analyze this lead', prompt: 'Analyze this lead and tell me what I should do next.', needsContact: true },
    { label: 'Draft a follow-up', prompt: 'Draft a follow-up for this lead.', needsContact: true },
    { label: 'Match to projects', prompt: 'Which projects best match this lead?', needsContact: true },
    { label: 'Why cold?', prompt: 'Why is this lead cold and how do I warm them up?', needsContact: true },
    { label: 'Similar past wins', prompt: 'Find past winning conversations similar to this lead.', needsContact: true },
  ],
  pipeline: [
    { label: "What's stalled?", prompt: "What's stalled in my pipeline?" },
    { label: 'Move-ready leads', prompt: 'Which leads are ready to move stage?' },
    { label: "Today's bookings", prompt: "What's on my calendar today?" },
    { label: 'Drop-off this week', prompt: 'Which leads dropped off this week and why?' },
  ],
  email: [
    { label: 'Needs my reply?', prompt: 'What emails are waiting on my reply?' },
    { label: 'Draft to this thread', prompt: 'Draft a reply for the thread I have open.' },
    { label: 'Past winners', prompt: 'Find similar past winning emails.' },
    { label: 'Tone-check draft', prompt: 'Tone-check the draft I just wrote.' },
  ],
  chats: [
    { label: 'Needs my reply?', prompt: 'Which chats are waiting on me?' },
    { label: 'Draft to this thread', prompt: 'Draft a reply for this chat thread.' },
    { label: 'Past winners', prompt: 'Find similar past winning chats.' },
  ],
  calendar: [
    { label: "Today's bookings", prompt: "What's booked today?" },
    { label: 'Follow up post-showing', prompt: 'Draft follow-ups for showings that just happened.' },
    { label: 'Reschedule no-shows', prompt: 'Help me reschedule no-shows from this week.' },
  ],
  templates: [
    { label: 'Best converter?', prompt: 'Which of my templates converts best?' },
    { label: 'Suggest a new one', prompt: 'Suggest a new template I should add.' },
    { label: 'Translate to Punjabi', prompt: 'Translate the template I have open into Punjabi.' },
  ],
  queue: [
    { label: "What's blocking approval?", prompt: "What's blocking approval in my Zara queue?" },
    { label: 'High-confidence drafts', prompt: 'Show me high-confidence drafts ready to send.' },
    { label: 'Explain a flag', prompt: 'Explain the most common guardrail flag this week.' },
  ],
  projects_list: [
    { label: 'Fit my hot leads', prompt: 'Which projects fit my hot leads right now?' },
    { label: 'Need updates', prompt: 'Which project notes need updating?' },
    { label: 'Launching soon', prompt: 'Which projects are launching in the next 60 days?' },
  ],
  reports: [
    { label: 'Explain this metric', prompt: 'Explain the metric I have open.' },
    { label: "What's the trend?", prompt: "What's the trend across these reports?" },
    { label: 'vs last month', prompt: 'How does this compare to last month?' },
  ],
  other: [
    { label: 'Morning briefing', prompt: 'Give me my morning briefing.' },
    { label: 'What needs my attention?', prompt: 'What needs my attention right now?' },
    { label: 'Show cold leads', prompt: 'Show me my cold leads.' },
    { label: 'Hot leads', prompt: 'Show me my hot leads.' },
  ],
};

export function getChipsForSurface(surface: ZaraSurface): ZaraChip[] {
  return CHIPS[surface] ?? CHIPS.other;
}
