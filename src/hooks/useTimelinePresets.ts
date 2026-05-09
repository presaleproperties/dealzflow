import { useCallback, useEffect, useState } from 'react';
import type { TimelineKind } from './useLeadTimelineV2';

export interface TimelinePreset {
  id: string;
  name: string;
  filterKey: 'all' | TimelineKind | 'comms';
  kinds: TimelineKind[] | null;
  search: string;
  createdAt: string;
}

const KEY = (contactId: string) => `crm-timeline-presets:${contactId}`;
const LAST_KEY = (contactId: string) => `crm-timeline-presets-last:${contactId}`;

function read(contactId: string): TimelinePreset[] {
  try {
    const raw = localStorage.getItem(KEY(contactId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(contactId: string, presets: TimelinePreset[]) {
  try {
    localStorage.setItem(KEY(contactId), JSON.stringify(presets));
  } catch {
    /* ignore quota */
  }
}

export function useTimelinePresets(contactId: string) {
  const [presets, setPresets] = useState<TimelinePreset[]>([]);
  const [lastAppliedId, setLastAppliedIdState] = useState<string | null>(null);

  useEffect(() => {
    if (!contactId) return;
    setPresets(read(contactId));
    try {
      setLastAppliedIdState(localStorage.getItem(LAST_KEY(contactId)));
    } catch {
      setLastAppliedIdState(null);
    }
  }, [contactId]);

  const savePreset = useCallback(
    (input: Omit<TimelinePreset, 'id' | 'createdAt'>) => {
      const next: TimelinePreset = {
        ...input,
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
      };
      setPresets((prev) => {
        const updated = [next, ...prev].slice(0, 12);
        write(contactId, updated);
        return updated;
      });
      return next;
    },
    [contactId],
  );

  const deletePreset = useCallback(
    (id: string) => {
      setPresets((prev) => {
        const updated = prev.filter((p) => p.id !== id);
        write(contactId, updated);
        return updated;
      });
      if (lastAppliedId === id) {
        try {
          localStorage.removeItem(LAST_KEY(contactId));
        } catch {
          /* ignore */
        }
        setLastAppliedIdState(null);
      }
    },
    [contactId, lastAppliedId],
  );

  const setLastAppliedId = useCallback(
    (id: string | null) => {
      setLastAppliedIdState(id);
      try {
        if (id) localStorage.setItem(LAST_KEY(contactId), id);
        else localStorage.removeItem(LAST_KEY(contactId));
      } catch {
        /* ignore */
      }
    },
    [contactId],
  );

  return { presets, savePreset, deletePreset, lastAppliedId, setLastAppliedId };
}
