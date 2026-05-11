/**
 * Shared transaction utilities — single source of truth for team deal logic,
 * net payout extraction, and effective commission calculations.
 *
 * SECURITY: Team-member detection MUST use exact first+last name matching.
 * The previous substring match (`name.includes('ravish')`) silently mis-flagged
 * anyone whose name contained those substrings (e.g. "Ravisha Patel",
 * "Sarbinder Gill") as a team member, switching the deal from gross commission
 * to net payout — a real money-loss bug.
 */

// Canonical team members (matched against ReZen participant first/last name).
// Lowercased for case-insensitive comparison; values come from crm_team
// (Ravish Passy, Sarb Grewal — see crm_team display_name + email mapping).
const TEAM_MEMBERS: Array<{ first: string; last: string }> = [
  { first: 'ravish', last: 'passy' },
  { first: 'sarb', last: 'grewal' },
];

/** @deprecated Kept for legacy imports; do not extend. */
export const TEAM_AGENT_NAMES = TEAM_MEMBERS.map((tm) => tm.first);

export interface TransactionParticipant {
  id?: string;
  firstName?: string | null;
  lastName?: string | null;
  emailAddress?: string;
  company?: string;
  participantRole?: string;
  payment?: { percent?: number };
}

function isTeamMember(firstName?: string | null, lastName?: string | null): boolean {
  if (!firstName) return false;
  const first = firstName.trim().toLowerCase();
  const last = (lastName ?? '').trim().toLowerCase();
  return TEAM_MEMBERS.some((tm) => tm.first === first && tm.last === last);
}

/**
 * Checks if a transaction is a team deal (Ravish Passy or Sarb Grewal as a
 * participant). Exact first+last match — no substring fuzziness.
 */
export function isTeamDeal(participants: TransactionParticipant[]): boolean {
  return participants.some((p) => isTeamMember(p.firstName, p.lastName));
}

/**
 * Checks if a raw transaction object (with raw_data.participants) is a team deal.
 */
export function isTeamDealFromRaw(rawData: any): boolean {
  const participants = rawData?.participants || [];
  return isTeamDeal(participants);
}

/**
 * Extracts user's net payout from raw_data.myNetPayout.amount.
 * Falls back to the provided fallback amount (typically commission_amount).
 */
export function extractNetPayout(rawData: any, fallback: number = 0): number {
  try {
    const myNet = rawData?.myNetPayout?.amount;
    if (myNet !== null && myNet !== undefined) {
      return Number(myNet);
    }
  } catch {}
  return fallback;
}

/**
 * Returns the appropriate commission amount for a transaction:
 * - Team deals (Ravish/Sarb): use net payout (user's 30% portion)
 * - All other deals: use gross commission
 */
export function getEffectiveCommission(
  rawData: any,
  commissionAmount: number
): number {
  if (isTeamDealFromRaw(rawData)) {
    return extractNetPayout(rawData, commissionAmount);
  }
  return commissionAmount;
}
