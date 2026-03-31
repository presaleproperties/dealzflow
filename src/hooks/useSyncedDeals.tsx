import { useMemo } from 'react';
import { useSyncedTransactions } from './usePlatformConnections';
import { isTeamDeal as checkIsTeamDealShared } from '@/lib/transactionUtils';

/**
 * Extracts a project name from a ReZen property address that encodes
 * presale project info in formats like:
 *   "Walker House - Part 1/2 Unit 507 - 11989 93A Ave..."
 *   "Part 2/2 - Jericho Park - 7883 199B Street..."
 *   "North Village Part 2/2 - 20072 86 Avenue..."
 *   "HAYER TOWN CENTRE, Unit 408 - 1/2 Commission..."
 */
export function extractProjectNameFromAddress(address: string | null): string | null {
  if (!address) return null;

  // Pattern 1: "Part N/N - ProjectName ..." — project name after "Part X/X -"
  const afterPart = address.match(/^[Pp]ar[kt]\s*\d\/\d\s*[-–]\s*([A-Za-z][A-Za-z\s]+?)(?:\s*[-–,]|\s+(?:Unit|#|\d))/);
  if (afterPart) return titleCase(afterPart[1].trim());

  // Pattern 2: "ProjectName Part N/N ..." — project name before "Part X/X"
  const beforePart = address.match(/^([A-Za-z][A-Za-z\s]+?)\s+[Pp]art\s+\d\/\d/);
  if (beforePart) return titleCase(beforePart[1].trim());

  // Pattern 3: "ProjectName - Part N/N ..." or "ProjectName, Part N/N ..."
  const beforePartDash = address.match(/^([A-Za-z][A-Za-z\s]+?)\s*[-–,]\s*[Pp]art\s*\d\/\d/);
  if (beforePartDash) return titleCase(beforePartDash[1].trim());

  // Pattern 4: "ProjectName N/N - ..." (e.g. "Walker House 1/2 - #703")
  const beforeFraction = address.match(/^([A-Za-z][A-Za-z\s]+?)\s+\d\/\d\s*[-–]/);
  if (beforeFraction) return titleCase(beforeFraction[1].trim());

  // Pattern 5: "PROJECT NAME, Unit NNN (1/2 commission...)" — HAYER style
  const commaUnit = address.match(/^([A-Z][A-Z\s]+?),\s*[Uu]nit/);
  if (commaUnit) return titleCase(commaUnit[1].trim());

  return null;
}

function titleCase(str: string): string {
  return str.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

export interface Participant {
  id: string;
  firstName?: string;
  lastName?: string;
  emailAddress?: string;
  phoneNumber?: string;
  company?: string;
  participantRole: string;
  payment?: { percent?: number };
  external?: boolean;
  paidByReal?: boolean;
}

export interface SyncedDeal {
  id: string;
  clientName: string;
  propertyAddress: string | null;
  projectName: string | null;
  status: 'active' | 'closed' | 'terminated' | 'pending';
  isListing: boolean;
  lifecycleState: string | null;
  journeyId: string | null;
  mlsNumber: string | null;
  salePrice: number | null;
  commissionAmount: number | null;
  myNetPayout: number | null;
  displayCommission: number | null;
  isTeamDeal: boolean;
  mySplitPercent: number | null;
  firmDate: string | null;
  closeDate: string | null;
  listingDate: string | null;
  clientEmail: string | null;
  clientPhone: string | null;
  participants: Participant[];
  rawData?: any;
}

function checkIsTeamDeal(participants: Participant[]): boolean {
  return checkIsTeamDealShared(participants);
}

export function useSyncedDeals() {
  const { data: syncedTransactions = [] } = useSyncedTransactions();

  const deals = useMemo(() => {
    return syncedTransactions.map((tx: any) => {
      const participants = (tx.raw_data?.participants || []) as Participant[];
      const isTeamDeal = checkIsTeamDeal(participants);
      // Listings are always solo (SELLERS_AGENT role), use gross commission
      // Team deals (Ravish/Sarb): use net payout; all others: gross commission
      const displayCommission = isTeamDeal
        ? (tx.my_net_payout || 0)
        : (tx.commission_amount || 0);
      
      const projectName =
        tx.raw_data?.projectName ||
        tx.raw_data?.project?.name ||
        extractProjectNameFromAddress(tx.property_address) ||
        null;

      // Extract client contact from DB columns first, fall back to participants
      const clientParticipant = participants.find((p: Participant) =>
        p.participantRole === 'BUYER' || p.participantRole === 'SELLER'
      ) || participants.find((p: Participant) => p.participantRole === 'CLIENT');
      
      const clientEmail = tx.client_email || clientParticipant?.emailAddress || null;
      const clientPhone = tx.client_phone || clientParticipant?.phoneNumber || null;

      return {
        id: tx.id,
        clientName: tx.client_name || 'Unknown',
        propertyAddress: tx.property_address,
        projectName,
        status: tx.status || 'pending',
        isListing: tx.is_listing || false,
        lifecycleState: tx.lifecycle_state,
        journeyId: tx.journey_id,
        mlsNumber: tx.mls_number,
        salePrice: tx.sale_price,
        commissionAmount: tx.commission_amount,
        myNetPayout: tx.my_net_payout,
        displayCommission,
        isTeamDeal,
        mySplitPercent: tx.my_split_percent,
        firmDate: tx.firm_date,
        closeDate: tx.close_date,
        listingDate: tx.listing_date,
        clientEmail,
        clientPhone,
        participants,
        rawData: tx.raw_data,
      } as SyncedDeal;
    });
  }, [syncedTransactions]);

  // Group by journey for presales (multiple parts of same deal)
  const dealsByJourney = useMemo(() => {
    const grouped = new Map<string | null, SyncedDeal[]>();
    
    deals.forEach(deal => {
      const key = deal.journeyId || deal.id;
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)!.push(deal);
    });

    return grouped;
  }, [deals]);

  // Split by status
  const activeDeals = useMemo(() => deals.filter(d => d.status === 'active'), [deals]);
  const closedDeals = useMemo(() => deals.filter(d => d.status === 'closed'), [deals]);
  const listings = useMemo(() => deals.filter(d => d.isListing), [deals]);

  return {
    deals,
    dealsByJourney,
    activeDeals,
    closedDeals,
    listings,
  };
}
