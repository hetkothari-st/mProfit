import { useMemo, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ShieldCheck } from 'lucide-react';
import {
  AI_CONNECTOR_AREAS, AI_CONNECTOR_AREA_INFO, FEATURE_MIN_TIER, meetsMinTier,
  type AiConnectorArea, type PlanTierValue,
} from '@everypaisa/shared';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { apiErrorMessage } from '@/api/client';
import { connectApi } from '@/api/connect.api';
import { useAuthStore } from '@/stores/auth.store';
import { leaveForChatbot } from './leaveForChatbot';
import { SharingToggles } from './SharingToggles';

const PROVIDER: Record<string, string> = { ChatGPT: 'OpenAI', Claude: 'Anthropic' };

/**
 * AI Connector approval: the chatbot's OAuth authorize step lands here. The
 * user picks what to share; Approve or Cancel sends the browser back to the
 * chatbot with a code or access_denied.
 */
export function ConnectAuthorizePage() {
  const { search } = useLocation();
  const reqId = new URLSearchParams(search).get('req') ?? '';
  const plan = (useAuthStore((s) => s.user?.plan) ?? 'FREE') as PlanTierValue;
  const allowed = meetsMinTier(plan, FEATURE_MIN_TIER.AI_CONNECTOR);
  const request = useQuery({ queryKey: ['connect', 'request', reqId], queryFn: () => connectApi.getRequest(reqId), enabled: reqId !== '', retry: false });
  const [picked, setPicked] = useState<Set<AiConnectorArea> | null>(null);
  const areas = useMemo(() => {
    if (picked) return picked;
    const current = request.data?.currentAreas;
    return new Set<AiConnectorArea>(current ?? AI_CONNECTOR_AREAS.filter((a) => AI_CONNECTOR_AREA_INFO[a].defaultOn));
  }, [picked, request.data]);
  const [pickedMembers, setPickedMembers] = useState<Set<string> | null>(null);
  // Family members start off; a reconnect keeps whoever was shared before.
  const memberIds = useMemo(() => pickedMembers ?? new Set(request.data?.currentMemberIds ?? []), [pickedMembers, request.data]);
  const decide = useMutation({
    mutationFn: (approve: boolean) => connectApi.decide(
      reqId, approve,
      approve ? AI_CONNECTOR_AREAS.filter((a) => areas.has(a)) : [],
      approve ? [...memberIds] : [],
    ),
    onSuccess: (r) => leaveForChatbot(r.redirectTo),
  });

  function toggle(a: AiConnectorArea) {
    const next = new Set(areas);
    if (next.has(a)) next.delete(a);
    else next.add(a);
    setPicked(next);
  }
  function toggleMember(id: string) {
    const next = new Set(memberIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPickedMembers(next);
  }

  if (!reqId || request.isError) {
    return (
      <Shell>
        <Card className="space-y-3 p-5 text-sm text-foreground">
          <p>
            {reqId
              ? apiErrorMessage(request.error, 'This connection request has expired. Start again from your chatbot.')
              : 'This link is missing its connection request. Start again from your chatbot.'}
          </p>
          <Link className="text-primary underline" to="/settings/ai-connectors">Go to Settings &gt; AI connectors</Link>
        </Card>
      </Shell>
    );
  }
  if (!request.data) {
    return <Shell><p className="text-sm text-muted-foreground">Loading...</p></Shell>;
  }
  const { clientName, redirectHost } = request.data;
  return (
    <Shell>
      <Card className="space-y-5 p-5">
        <div className="space-y-1">
          <h1 className="text-lg font-semibold text-foreground">{clientName} wants read-only access to your EveryPaisa data</h1>
          <p className="text-xs text-muted-foreground">Verified address: <span className="font-mono">{redirectHost}</span></p>
        </div>
        {!allowed ? (
          <div className="space-y-3 text-sm text-foreground">
            <p>Connecting your own ChatGPT or Claude needs the Plus plan.</p>
            <div className="flex flex-wrap gap-2">
              <Button asChild><Link to="/pricing">See plans</Link></Button>
              <Button variant="outline" disabled={decide.isPending} onClick={() => decide.mutate(false)}>Cancel</Button>
            </div>
          </div>
        ) : (
          <>
            <SharingToggles
              clientName={clientName} areas={areas} onToggleArea={toggle}
              members={request.data.members} memberIds={memberIds} onToggleMember={toggleMember}
            />
            <ul className="space-y-1 text-xs text-muted-foreground">
              <li>Read-only: {clientName} can never add, change or delete anything.</li>
              <li>Account, card, policy and ID numbers are shown as the last 4 characters only.</li>
              <li>What it reads goes to {PROVIDER[clientName] ?? clientName} under your own account, and their data rules apply.</li>
              <li>You can change this or revoke access any time in Settings &gt; AI connectors.</li>
            </ul>
            {decide.isError && <p className="text-sm text-destructive">{apiErrorMessage(decide.error, 'Could not save your choice. Try again.')}</p>}
            <div className="flex flex-wrap gap-2">
              <Button disabled={decide.isPending} onClick={() => decide.mutate(true)}>Approve</Button>
              <Button variant="outline" disabled={decide.isPending} onClick={() => decide.mutate(false)}>Cancel</Button>
            </div>
          </>
        )}
      </Card>
    </Shell>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto w-full max-w-lg space-y-4">
        <div className="flex items-center gap-2 text-foreground">
          <ShieldCheck className="h-5 w-5" aria-hidden />
          <span className="font-semibold">EveryPaisa</span>
        </div>
        {children}
      </div>
    </div>
  );
}
