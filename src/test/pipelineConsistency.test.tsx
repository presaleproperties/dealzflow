/**
 * Pipeline consistency regression suite.
 *
 * Every CRM surface that shows stage labels or counts ultimately reads from
 * one of three primitives:
 *   - `useUnifiedPipelines` / `useActivePipelineFor` (Kanban, Leads table row
 *     pipeline cell, Lead Detail sidebar, Edit Lead Sheet, Quick Actions)
 *   - `useContactsByPipeline` (Dashboard snapshot, pulse, conversion funnel)
 *   - `assignContactsToSegments` / `computeSegmentCounts` (Reports funnel,
 *     segment pills)
 *
 * If those three agree for a given (segments, contacts) fixture, every
 * surface in the app necessarily agrees. We pin that contract here so a
 * future change to any one of them is caught the moment the others drift.
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

import {
  contactMatchesSegment,
  assignContactsToSegments,
  computeSegmentCounts,
} from '@/lib/segmentMatching';
import { LeadStatusBadge } from '@/components/crm/leads/LeadStatusBadge';

// Mock the supabase client so the segments hook can be intercepted.
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(),
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    rpc: vi.fn(),
  },
}));

// Stub the segments hook to return our deterministic fixture.
const SEGMENTS = [
  {
    id: 'seg-new',
    name: 'New Lead',
    emoji: null,
    color: '#888',
    sort_order: 10,
    is_default: false,
    filter_config: { status: ['New Lead'] },
  },
  {
    id: 'seg-presale',
    name: 'Presale 🔥',
    emoji: null,
    color: '#D7A542',
    sort_order: 20,
    is_default: false,
    filter_config: { tags_any_ci: ['presale'], lead_type_ci: ['pre-sale'] },
  },
  {
    id: 'seg-resale',
    name: 'Resale 🔥',
    emoji: null,
    color: '#7AB87A',
    sort_order: 30,
    is_default: false,
    filter_config: { tags_any_ci: ['resale'], lead_type_ci: ['re-sale'] },
  },
  {
    id: 'seg-allleads',
    name: 'All Leads',
    emoji: null,
    color: '#666',
    sort_order: 999,
    is_default: true,
    filter_config: {}, // catch-all, must be excluded from pipelines
  },
];

vi.mock('@/hooks/useCrmLeadSegments', () => ({
  useCrmLeadSegments: () => ({ data: SEGMENTS, isLoading: false, error: null }),
}));

import { useUnifiedPipelines, useActivePipelineFor } from '@/hooks/useUnifiedPipelines';
import { useContactsByPipeline } from '@/hooks/useContactsByPipeline';

// Minimal CrmContact fixture — only fields touched by the matchers.
const mk = (over: Partial<any>) => ({
  id: over.id ?? 'c?',
  first_name: 'A',
  last_name: 'B',
  email: null,
  phone: null,
  tags: [],
  lead_type: null,
  status: null,
  source: null,
  contact_type: 'Lead',
  pipeline_segment_id: null,
  projects: [],
  ...over,
});

const CONTACTS = [
  mk({ id: 'c1', status: 'New Lead' }),                              // → seg-new
  mk({ id: 'c2', status: 'New Lead', tags: ['Presale'] }),           // presale tag → seg-presale (specific wins)
  mk({ id: 'c3', lead_type: 'Pre-Sale' }),                           // → seg-presale (ci)
  mk({ id: 'c4', tags: ['resale'] }),                                // → seg-resale
  mk({ id: 'c5', status: 'Contacted' }),                             // → none (unbucketed)
  mk({ id: 'c6', pipeline_segment_id: 'seg-resale', status: 'New Lead' }), // canonical wins → seg-resale
];

// Expected per-segment buckets (first-match-wins / canonical-wins).
const EXPECTED_BUCKETS: Record<string, string[]> = {
  'seg-new':     ['c1'],                  // c2 specificity-wins to presale via useActivePipelineFor, but assignContactsToSegments uses sort_order first-match → also presale? See note below.
  'seg-presale': ['c2', 'c3'],
  'seg-resale':  ['c4', 'c6'],
};

const wrap = ({ children }: { children: React.ReactNode }) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
};

describe('pipeline consistency across CRM surfaces', () => {
  it('useUnifiedPipelines excludes the All Leads catch-all and is sorted', () => {
    const { result } = renderHook(() => useUnifiedPipelines(), { wrapper: wrap });
    expect(result.current.pipelines.map(p => p.id)).toEqual([
      'seg-new',
      'seg-presale',
      'seg-resale',
    ]);
  });

  it('assignContactsToSegments + computeSegmentCounts agree with useContactsByPipeline', () => {
    const assigned = assignContactsToSegments(CONTACTS as any, SEGMENTS as any);
    const assignedCounts = Object.fromEntries(
      Object.entries(assigned).map(([k, v]) => [k, v.length]),
    );

    const { result } = renderHook(() => useContactsByPipeline(CONTACTS as any), { wrapper: wrap });
    const dashboardCounts = Object.fromEntries(
      result.current.buckets.map(b => [b.segment.id, b.count]),
    );

    // Dashboard hook (used by Snapshot/Pulse/Funnel) must match the Kanban
    // assignment exactly for the three real pipelines.
    for (const segId of ['seg-new', 'seg-presale', 'seg-resale']) {
      expect(dashboardCounts[segId]).toBe(assignedCounts[segId]);
    }

    // Total contacts represented across pipelines is identical.
    const totalAssigned = Object.values(assignedCounts).reduce((s, n) => s + n, 0);
    expect(result.current.total).toBe(totalAssigned);
  });

  it('useActivePipelineFor returns the same label that the Kanban bucket would', () => {
    const assigned = assignContactsToSegments(CONTACTS as any, SEGMENTS as any);
    const idToSegName: Record<string, string> = {};
    for (const [segId, list] of Object.entries(assigned)) {
      const segName = SEGMENTS.find(s => s.id === segId)!.name;
      for (const c of list) idToSegName[c.id] = segName;
    }

    for (const c of CONTACTS) {
      const { result } = renderHook(() => useActivePipelineFor(c as any), { wrapper: wrap });
      const expected = idToSegName[c.id] ?? null;
      expect(result.current?.name ?? null).toBe(expected);
    }
  });

  it('Reports funnel counts (computeSegmentCounts) ≥ Kanban first-match counts', () => {
    // Reports counts every match (a presale lead in "New Lead" status counts
    // under BOTH). This is by design — see comment on computeSegmentCounts.
    // The invariant is: report count ≥ first-match count for every segment.
    const direct = computeSegmentCounts(CONTACTS as any, SEGMENTS as any);
    const assigned = assignContactsToSegments(CONTACTS as any, SEGMENTS as any);
    for (const seg of SEGMENTS) {
      if (!seg.filter_config || Object.keys(seg.filter_config).length === 0) continue;
      expect(direct[seg.id]).toBeGreaterThanOrEqual(assigned[seg.id]?.length ?? 0);
    }
  });

  it('LeadStatusBadge renders the same label string used by pipeline buckets', () => {
    // The leads-table status badge must use the same human label as the
    // pipeline pill above it. We render it for every pipeline name and
    // assert the text appears verbatim.
    for (const seg of SEGMENTS) {
      if (!seg.filter_config || Object.keys(seg.filter_config).length === 0) continue;
      const { unmount } = render(<LeadStatusBadge status={seg.name} />);
      expect(screen.getByText(seg.name)).toBeInTheDocument();
      unmount();
    }
  });

  it('contactMatchesSegment honors canonical pipeline_segment_id', () => {
    const c = mk({ id: 'cx', pipeline_segment_id: 'seg-resale', status: 'New Lead' });
    // Canonical short-circuits → matches resale even though status says new.
    expect(contactMatchesSegment(c as any, SEGMENTS[2].filter_config, 'seg-resale')).toBe(true);
  });
});
