import type { Money } from './decimal.js';

export const SPLIT_MODES = ['EQUAL', 'EXACT', 'PERCENT', 'SHARES'] as const;
export type SplitModeDto = (typeof SPLIT_MODES)[number];
export const SPLIT_GROUP_TYPES = ['TRIP', 'HOME', 'COUPLE', 'OTHER', 'DIRECT'] as const;
export type SplitGroupTypeDto = (typeof SPLIT_GROUP_TYPES)[number];
export const SPLIT_SETTLE_METHODS = ['CASH', 'UPI', 'OTHER'] as const;
export type SplitSettleMethodDto = (typeof SPLIT_SETTLE_METHODS)[number];

export interface SplitMemberDto { id: string; displayName: string; userId: string | null; contactId: string | null; isMe: boolean; leftAt: string | null }
export interface SplitGroupDto { id: string; name: string; type: SplitGroupTypeDto; baseCurrency: string; simplifyDebts: boolean; archivedAt: string | null; members: SplitMemberDto[]; myNet: Money }
export interface SplitPayerDto { memberId: string; amount: Money; baseAmount: Money }
export interface SplitShareDto { memberId: string; amount: Money; baseAmount: Money; rawInput: string | null }
export interface SplitExpenseDto {
  id: string; groupId: string; description: string; date: string;
  amount: Money; currency: string; fxRate: string; baseAmount: Money;
  splitMode: SplitModeDto; createdById: string; createdAt: string; sourceType: string;
  deletedAt: string | null; payers: SplitPayerDto[]; shares: SplitShareDto[];
  labelIds: string[]; hasReceipt: boolean;
}
export interface SplitSettlementDto { id: string; groupId: string; fromMemberId: string; toMemberId: string; amount: Money; currency: string; fxRate: string; baseAmount: Money; method: SplitSettleMethodDto; date: string; createdById: string; createdAt: string; deletedAt: string | null }
export interface SplitTransferDto { fromMemberId: string; toMemberId: string; amount: Money }
export interface SplitBalancesDto { groupId: string; baseCurrency: string; nets: Array<{ memberId: string; net: Money }>; transfers: SplitTransferDto[]; simplified: boolean }
export interface SplitFriendDto { key: string; displayName: string; userId: string | null; contactId: string | null; currency: string; net: Money; approx: boolean; groups: Array<{ groupId: string; groupName: string; groupType?: SplitGroupTypeDto; net: Money; currency: string }> }
export interface SplitContactDto { id: string; name: string; email: string | null; phone: string | null; upiId: string | null; linkedUserId: string | null }
export interface SplitActivityDto { id: string; groupId: string; groupName: string; actorUserId: string; actorName: string; kind: string; payload: unknown; createdAt: string }

export interface SplitLabelDto { id: string; groupId: string; name: string; color: string }
export interface SplitCommentDto { id: string; expenseId: string; authorUserId: string; authorName: string; body: string; createdAt: string; mine: boolean }
export interface SplitSettingsDto { upiId: string | null; homeCurrency: string; defaultPortfolioId: string | null; emailOnActivity: boolean; weeklyDigest: boolean }
export interface SplitUpiLinkDto { uri: string; payeeName: string; payeeVpa: string; amount: Money; note: string }
export interface SplitShareLinkDto { expenseId: string; enabled: boolean; portfolioId: string | null; cashFlowId: string | null; myShare: Money; currency: string }
