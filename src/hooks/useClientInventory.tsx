import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useSyncedDeals, SyncedDeal, Participant } from './useSyncedDeals';
import { toast } from 'sonner';
import { useMemo } from 'react';

export type InventoryPropertyType = 'Condo' | 'Townhome' | 'Detached Home' | 'Presale' | null;

export interface ClientInventoryRecord {
  id: string;
  user_id: string;
  synced_transaction_id: string | null;
  buyer_name: string | null;
  project_name: string | null;
  property_address: string | null;
  purchase_date: string | null;
  close_date: string | null;
  close_date_est: string | null;
  purchase_price: number | null;
  property_type: string | null;
  notes: string | null;
  is_manual: boolean;
  journey_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ClientInventoryItem {
  id: string;
  buyerName: string;
  projectName: string | null;
  propertyAddress: string | null;
  purchaseDate: string | null;
  closeDate: string | null;
  closeDateEst: string | null;
  purchasePrice: number | null;
  propertyType: string | null;
  notes: string | null;
  isManual: boolean;
  journeyId: string | null;
  syncedTransactionId: string | null;
  clientEmail: string | null;
  clientPhone: string | null;
  // Enriched from synced deal
  dealStatus?: string;
  isPresale?: boolean;
  isPotentialDuplicate?: boolean;
  duplicateReason?: string | null;
  commissionAmount?: number | null;
}

export interface ClientInventoryFormData {
  buyer_name: string;
  project_name?: string;
  property_address?: string;
  purchase_date?: string;
  close_date?: string;
  close_date_est?: string;
  purchase_price?: number;
  property_type?: string;
  notes?: string;
  synced_transaction_id?: string;
  journey_id?: string;
  is_manual?: boolean;
}

/** Extract the primary buyer name from synced deal participants */
function extractBuyerName(participants: Participant[]): string {
  const buyer = participants.find(p => p.participantRole === 'BUYER');
  const fallback = participants[0];
  const p = buyer || fallback;
  if (!p) return 'Unknown';
  const name = [p.firstName, p.lastName].filter(Boolean).join(' ');
  return name || p.company || 'Unknown';
}

/** Detect if a deal is a presale by project name or address suffix */
function detectIsPresale(deal: SyncedDeal): boolean {
  const addr = (deal.propertyAddress || '').toLowerCase();
  const proj = (deal.rawData?.project?.name || '').toLowerCase();
  return addr.includes('part 1') || addr.includes('part 2') ||
    proj.includes('presale') || !!deal.journeyId;
}

export function useClientInventory() {
  const { user } = useAuth();
  const { deals } = useSyncedDeals();

  // Fetch stored inventory records (enrichments + manual entries)
  const { data: inventoryRecords = [], isLoading } = useQuery({
    queryKey: ['client_inventory', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from('client_inventory')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as ClientInventoryRecord[];
    },
    enabled: !!user,
  });

  // Build enrichment map: synced_transaction_id -> record
  const enrichmentMap = useMemo(() => {
    const map = new Map<string, ClientInventoryRecord>();
    inventoryRecords.forEach(r => {
      if (r.synced_transaction_id) map.set(r.synced_transaction_id, r);
    });
    return map;
  }, [inventoryRecords]);

  // Build inventory items from synced deals
  const syncedItems = useMemo((): ClientInventoryItem[] => {
    // Separate manual imports (platform === 'manual') from ReZen deals
    // Manual imports: each deal is a separate client — show individually
    // ReZen presales: group by journeyId (Part 1/2 + Part 2/2 = same property, same client)
    const rezenJourneyMap = new Map<string, SyncedDeal[]>();
    const individualDeals: SyncedDeal[] = [];

    deals.forEach(deal => {
      const isManualImport = deal.rawData?.source === 'manual_import';
      if (deal.journeyId && !isManualImport) {
        // Only group ReZen multi-part presales by journey
        if (!rezenJourneyMap.has(deal.journeyId)) rezenJourneyMap.set(deal.journeyId, []);
        rezenJourneyMap.get(deal.journeyId)!.push(deal);
      } else {
        // Manual imports and all standalone deals show individually
        individualDeals.push(deal);
      }
    });

    const items: ClientInventoryItem[] = [];

    // Process ReZen journeyed presales — merge Part 1/2 + Part 2/2 into one row
    rezenJourneyMap.forEach((groupDeals, journeyId) => {
      const primary = groupDeals.sort((a, b) =>
        (b.salePrice || 0) - (a.salePrice || 0)
      )[0];
      const enrichment = groupDeals.map(d => enrichmentMap.get(d.id)).find(Boolean);
      const extractedName = extractBuyerName(primary.participants);
      const buyerName = extractedName !== 'Unknown' ? extractedName : (primary.clientName || 'Unknown');
      const anyDupFlag = groupDeals.some(d => d.rawData?.potential_duplicate === true);
      const dupReason = groupDeals.find(d => d.rawData?.duplicate_reason)?.rawData?.duplicate_reason ?? null;

      items.push({
        id: enrichment?.id || `journey-${journeyId}`,
        buyerName: enrichment?.buyer_name || buyerName,
        projectName: enrichment?.project_name || primary.projectName || null,
        propertyAddress: enrichment?.property_address || primary.propertyAddress,
        purchaseDate: enrichment?.purchase_date || primary.firmDate,
        closeDate: enrichment?.close_date || primary.closeDate,
        closeDateEst: enrichment?.close_date_est || null,
        purchasePrice: enrichment?.purchase_price || primary.salePrice,
        propertyType: enrichment?.property_type || null,
        notes: enrichment?.notes || null,
        isManual: false,
        journeyId,
        syncedTransactionId: primary.id,
        dealStatus: primary.status,
        isPresale: true,
        isPotentialDuplicate: anyDupFlag,
        duplicateReason: dupReason,
        commissionAmount: primary.commissionAmount,
      });
    });

    // Process individual deals (manual imports + standalone ReZen deals)
    individualDeals.forEach(deal => {
      const enrichment = enrichmentMap.get(deal.id);
      const extractedName = extractBuyerName(deal.participants);
      const buyerName = extractedName !== 'Unknown' ? extractedName : (deal.clientName || 'Unknown');

      items.push({
        id: enrichment?.id || `synced-${deal.id}`,
        buyerName: enrichment?.buyer_name || buyerName,
        projectName: enrichment?.project_name || deal.projectName || null,
        propertyAddress: enrichment?.property_address || deal.propertyAddress,
        purchaseDate: enrichment?.purchase_date || deal.firmDate,
        closeDate: enrichment?.close_date || deal.closeDate,
        closeDateEst: enrichment?.close_date_est || null,
        purchasePrice: enrichment?.purchase_price || deal.salePrice,
        propertyType: enrichment?.property_type || null,
        notes: enrichment?.notes || null,
        isManual: deal.rawData?.source === 'manual_import',
        journeyId: deal.journeyId,
        syncedTransactionId: deal.id,
        dealStatus: deal.status,
        isPresale: detectIsPresale(deal),
        isPotentialDuplicate: deal.rawData?.potential_duplicate === true,
        duplicateReason: deal.rawData?.duplicate_reason ?? null,
        commissionAmount: deal.commissionAmount,
      });
    });

    return items;
  }, [deals, enrichmentMap]);

  // Manual-only records (not linked to any synced deal)
  const manualItems = useMemo((): ClientInventoryItem[] => {
    return inventoryRecords
      .filter(r => r.is_manual && !r.synced_transaction_id)
      .map(r => ({
        id: r.id,
        buyerName: r.buyer_name || 'Unknown',
        projectName: r.project_name,
        propertyAddress: r.property_address,
        purchaseDate: r.purchase_date,
        closeDate: r.close_date,
        closeDateEst: r.close_date_est,
        purchasePrice: r.purchase_price,
        propertyType: r.property_type,
        notes: r.notes,
        isManual: true,
        journeyId: r.journey_id,
        syncedTransactionId: null,
        dealStatus: undefined,
        isPresale: false,
      }));
  }, [inventoryRecords]);

  const allItems = useMemo(() => [...syncedItems, ...manualItems], [syncedItems, manualItems]);

  return { allItems, syncedItems, manualItems, inventoryRecords, isLoading };
}

export function useUpsertClientInventory() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      data,
      existingId,
    }: {
      data: ClientInventoryFormData;
      existingId?: string;
    }) => {
      if (!user) throw new Error('Not authenticated');

      if (existingId && !existingId.startsWith('journey-') && !existingId.startsWith('synced-')) {
        // Update existing record
        const { error } = await supabase
          .from('client_inventory')
          .update({ ...data, updated_at: new Date().toISOString() })
          .eq('id', existingId)
          .eq('user_id', user.id);
        if (error) throw error;
      } else {
        // Insert new record
        const { error } = await supabase
          .from('client_inventory')
          .insert({ ...data, user_id: user.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client_inventory'] });
      toast.success('Client inventory updated');
    },
    onError: (err: Error) => {
      toast.error(`Failed to save: ${err.message}`);
    },
  });
}

export function useDeleteClientInventory() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (id: string) => {
      if (!user) throw new Error('Not authenticated');
      const { error } = await supabase
        .from('client_inventory')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client_inventory'] });
      toast.success('Entry removed');
    },
    onError: (err: Error) => {
      toast.error(`Failed to delete: ${err.message}`);
    },
  });
}
