import { useState, useMemo, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  Loader2,
  Users,
  UserPlus,
  Trash2,
  Plus,
  X,
  Briefcase,
  Info,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EmptyState } from '@/components/common/EmptyState';
import {
  familiesApi,
  NON_AC_CATEGORIES,
  type FamilyMemberRow,
  type FamilyRole,
  type NonAcCategory,
  type SeatPaymentRequiredResult,
  type SeatUsage,
  familyInviteEmailApi,
  familyClaimApi,
} from '@/api/families.api';
import { useManageProfile } from '@/hooks/useManageProfile';
import { RelationPicker, type RelationValue } from '@/components/family/RelationPicker';
import { InviteEmailComposer } from '@/components/ca/InviteEmailComposer';
import { portfoliosApi } from '@/api/portfolios.api';
import { apiErrorMessage } from '@/api/client';
import { useAuthStore } from '@/stores/auth.store';
import { useFamilyScopeStore } from '@/stores/familyScope.store';
import { FamilyTreeCanvas } from '@/components/family/FamilyTreeCanvas';
import { LockedFeature } from '@/components/common/LockedFeature';
import { openRazorpayCheckout } from '@/lib/razorpay';
import {
  ALL_ASSET_CLASSES,
  ASSET_CLASS_LABEL,
  NON_AC_CATEGORY_LABEL,
} from '@/lib/assetClasses';
import { familyDashboardApi, familyDashboardKeys } from '@/api/familyDashboard.api';
import { FamilyWealthCard } from './widgets/FamilyWealthCard';
import { FamilyGoalsCard } from './widgets/FamilyGoalsCard';
import { FamilyProtectionCard } from './widgets/FamilyProtectionCard';
import { FamilyAttentionCard } from './widgets/FamilyAttentionCard';

/**
 * Dedicated Family page — two tabs over one selected family.
 *
 * **Overview** is the household's financial picture: wealth and who it sits
 * with, shared goals, protection and liabilities, and a ranked feed of what
 * needs attention. Reads the four `/dashboard/*` endpoints, FAMILY-tier gated.
 *
 * **Members** is the original management surface, moved here wholesale: the
 * visual tree canvas, invitations, the per-member permission matrix, and
 * family-shared portfolios. Nothing about it changed — it is the same
 * components, one level deeper.
 *
 * Full-page canvas instead of a cramped Settings section, because the
 * feature has real weight. Separate route (`/family`) linked from the
 * Overview nav.
 */
const REFETCH_MS = 30_000;

export function FamilyPage() {
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const setFamily = useFamilyScopeStore((s) => s.setFamily);

  const familiesQuery = useQuery({
    queryKey: ['families', 'mine'],
    queryFn: () => familiesApi.list(),
    staleTime: REFETCH_MS,
    refetchOnWindowFocus: true,
    refetchInterval: REFETCH_MS,
  });
  const families = familiesQuery.data ?? [];

  const [selectedFamilyId, setSelectedFamilyId] = useState<string | null>(null);

  // Auto-select the first family so the user isn't stuck on an empty
  // page after they create/accept one.
  useEffect(() => {
    if (!selectedFamilyId && families.length > 0) {
      setSelectedFamilyId(families[0]!.id);
    }
  }, [families, selectedFamilyId]);

  const selected = families.find((f) => f.id === selectedFamilyId) ?? null;

  const [creatingFamily, setCreatingFamily] = useState(false);
  const [newFamilyName, setNewFamilyName] = useState('');

  const createFamilyMutation = useMutation({
    mutationFn: (name: string) => familiesApi.create({ name }),
    onSuccess: (res) => {
      toast.success('Family created');
      setNewFamilyName('');
      setCreatingFamily(false);
      setSelectedFamilyId(res.id);
      queryClient.invalidateQueries({ queryKey: ['families', 'mine'] });
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Create failed')),
  });

  const activateFamilyView = (familyId: string, familyName: string) => {
    setFamily(familyId, familyName);
    queryClient.removeQueries();
    void queryClient.invalidateQueries();
    toast.success(`Viewing as ${familyName}`);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Family"
        title="The household, whole"
        description="One picture of the family's wealth, shared goals, protection and open items — with the per-member breakdown behind it. Owners see everything; contributors and viewers see own personal + family-shared, filtered per their role, and anything withheld is labelled as withheld."
        actions={
          <Button size="sm" onClick={() => setCreatingFamily(true)}>
            <Plus className="h-4 w-4" strokeWidth={2} />
            <span className="ml-1">New family</span>
          </Button>
        }
      />

      {creatingFamily && (
        <LockedFeature requiredTier="FAMILY" featureName="Family Sharing">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle>Create a new family</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Input
                  autoFocus
                  placeholder="e.g. Kothari Family"
                  value={newFamilyName}
                  onChange={(e) => setNewFamilyName(e.target.value)}
                  className="flex-1"
                  disabled={createFamilyMutation.isPending}
                />
                <Button
                  onClick={() => createFamilyMutation.mutate(newFamilyName.trim())}
                  disabled={!newFamilyName.trim() || createFamilyMutation.isPending}
                >
                  {createFamilyMutation.isPending && (
                    <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                  )}
                  Create
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setCreatingFamily(false);
                    setNewFamilyName('');
                  }}
                >
                  Cancel
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                You become the OWNER. Add other OWNERs later for joint families
                (grandpa + father + uncle each as OWNER is the canonical joint-
                family setup).
              </p>
            </CardContent>
          </Card>
        </LockedFeature>
      )}

      {familiesQuery.isLoading ? (
        <div className="text-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground mx-auto" />
        </div>
      ) : families.length === 0 && !creatingFamily ? (
        <EmptyState
          icon={Users}
          title="No families yet"
          description="Create a family to invite members and manage shared portfolios. If an OWNER already sent you an invite, click the link they shared."
          action={<Button onClick={() => setCreatingFamily(true)}>Create a family</Button>}
        />
      ) : (
        families.length > 0 && (
          <>
            {/* Family tabs — only shown when user is in ≥2 families */}
            {families.length > 1 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                {families.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setSelectedFamilyId(f.id)}
                    className={`px-3 py-1.5 rounded-md border text-sm transition-colors ${
                      selectedFamilyId === f.id
                        ? 'border-accent bg-accent/5 text-foreground'
                        : 'border-border hover:bg-muted/50 text-muted-foreground'
                    }`}
                  >
                    <Users className="inline h-3.5 w-3.5 mr-1.5" strokeWidth={1.7} />
                    {f.name}
                    <span className="ml-1.5 text-[10px] uppercase tracking-kerned text-muted-foreground">
                      {f.role.toLowerCase()}
                    </span>
                  </button>
                ))}
              </div>
            )}
            {selected && (
              <FamilyWorkspace
                key={selected.id}
                family={selected}
                currentUserId={user?.id}
                onActivateFamilyView={activateFamilyView}
              />
            )}
          </>
        )
      )}
    </div>
  );
}

// ─── Family workspace ────────────────────────────────────────────────

function FamilyWorkspace({
  family,
  currentUserId,
  onActivateFamilyView,
}: {
  family: {
    id: string;
    name: string;
    role: FamilyRole;
    description: string | null;
    seats: SeatUsage | null;
  };
  currentUserId: string | undefined;
  onActivateFamilyView: (id: string, name: string) => void;
}) {
  const queryClient = useQueryClient();
  const isOwner = family.role === 'OWNER';

  const membersQuery = useQuery({
    queryKey: ['families', family.id, 'members'],
    queryFn: () => familiesApi.members(family.id),
    staleTime: REFETCH_MS,
    refetchOnWindowFocus: true,
    refetchInterval: REFETCH_MS,
  });
  const pendingQuery = useQuery({
    queryKey: ['families', family.id, 'invitations'],
    queryFn: () => familiesApi.pendingInvitations(family.id),
    enabled: isOwner,
    staleTime: REFETCH_MS,
    refetchOnWindowFocus: true,
  });

  // Family-shared portfolios — read from portfolios endpoint (which is
  // scope-aware and includes them). We could get them from an /api
  // family-scoped endpoint later.
  const portfoliosQuery = useQuery({
    queryKey: ['portfolios', 'family-shared', family.id],
    queryFn: async () => {
      // Fetch personal-view portfolios list (baseline) and filter for
      // familyId match. Server sends familyId in the DTO now.
      const all = await portfoliosApi.list();
      return all.filter((p) => p.familyId === family.id);
    },
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  const [editingMember, setEditingMember] = useState<FamilyMemberRow | null>(null);
  // `false` = closed; otherwise open, relating the new person to this member
  // (a tree card's "Add") or to you (the header button).
  const [adding, setAdding] = useState<false | { relatedToId?: string }>(false);
  const { enter: manageProfile } = useManageProfile();
  const [creatingPortfolio, setCreatingPortfolio] = useState(false);
  const [sharingExisting, setSharingExisting] = useState(false);
  const [tab, setTab] = useState<'overview' | 'members'>('overview');

  const revokeMutation = useMutation({
    mutationFn: (memberUserId: string) =>
      familiesApi.revokeMember(family.id, memberUserId),
    onSuccess: () => {
      toast.success('Removed from the family');
      queryClient.invalidateQueries({ queryKey: ['families', family.id, 'members'] });
      queryClient.invalidateQueries({ queryKey: ['families', 'mine'] });
      queryClient.invalidateQueries({ queryKey: ['family-tree-layout', family.id] });
      queryClient.invalidateQueries({ queryKey: ['managed-profiles'] });
      // A managed member takes their portfolios with them.
      queryClient.invalidateQueries({ queryKey: ['portfolios'] });
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Could not remove them')),
  });

  const members = membersQuery.data ?? [];
  const activeMembers = members.filter((m) => m.status === 'ACTIVE');
  const familyPortfolios = portfoliosQuery.data ?? [];

  return (
    <div className="space-y-6">
      {/* Header + activate-view CTA */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <p className="text-[10px] uppercase tracking-kerned text-accent-ink mb-1">
                {activeMembers.length} active member{activeMembers.length === 1 ? '' : 's'}
                {' · '}your role: {family.role.toLowerCase()}
              </p>
              {family.seats && <SeatLine seats={family.seats} />}
              <h2 className="font-display text-2xl leading-none tracking-tight">
                {family.name}
              </h2>
              {family.description && (
                <p className="mt-2 text-sm text-muted-foreground">
                  {family.description}
                </p>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onActivateFamilyView(family.id, family.name)}
            >
              <Users className="h-3.5 w-3.5" strokeWidth={1.9} />
              <span className="ml-1">View this family across the app</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Overview is the default: the household's picture is what the family
          came for. Membership management — tree, invites, permissions,
          shared portfolios — lives one tab across, unchanged.

          The two panels are rendered differently on purpose. Overview goes in
          a real <TabsContent>, which unmounts when inactive, so a user working
          on the Members tab never fires four dashboard requests. Members is a
          plain hidden panel that stays mounted, because FamilyTreeCanvas holds
          un-saved node positions in local state — unmounting it on a tab
          switch would silently throw away a drag the user hasn't saved yet. */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as 'overview' | 'members')}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="members">Members &amp; sharing</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-5 space-y-6">
          <LockedFeature requiredTier="FAMILY" featureName="Family dashboard">
            <FamilyOverviewTab familyId={family.id} />
          </LockedFeature>
        </TabsContent>

        <div role="tabpanel" hidden={tab !== 'members'} className="mt-5 space-y-6">
          {/* Tree */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle>Family tree</CardTitle>
                {isOwner && (
                  <Button size="sm" onClick={() => setAdding({})}>
                    <UserPlus className="h-4 w-4" strokeWidth={1.9} />
                    <span className="ml-1">Add member</span>
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {membersQuery.isLoading ? (
                <div className="text-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground mx-auto" />
                </div>
              ) : (
                <FamilyTreeCanvas
                  familyId={family.id}
                  members={members}
                  currentUserId={currentUserId}
                  isOwner={isOwner}
                  onEdit={(m) => setEditingMember(m)}
                  onManage={(m) => void manageProfile({ id: m.userId, name: m.name })}
                  onAddRelative={isOwner ? (m) => setAdding({ relatedToId: m.userId }) : undefined}
                  onRevoke={(m) => {
                    const message = m.managed
                      ? `Delete ${m.name} from the family?\n\nTheir account and everything recorded in it — portfolios, FDs, insurance — will be deleted permanently. This cannot be undone.`
                      : `Remove ${m.name} from the family?\n\nThey keep their own EveryPaisa account and data; they just leave this family.`;
                    if (confirm(message)) revokeMutation.mutate(m.userId);
                  }}
                />
              )}
            </CardContent>
          </Card>

          {/* Pending invitations */}
          {isOwner && (pendingQuery.data?.length ?? 0) > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle>Pending invitations</CardTitle>
              </CardHeader>
              <CardContent>
                <PendingInvitationsList
                  familyId={family.id}
                  invitations={pendingQuery.data ?? []}
                />
              </CardContent>
            </Card>
          )}

          {/* Family-shared portfolios */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <CardTitle>Shared portfolios</CardTitle>
                {(isOwner || family.role === 'CONTRIBUTOR') && (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setSharingExisting(true)}
                    >
                      <Briefcase className="h-4 w-4" strokeWidth={1.9} />
                      <span className="ml-1">Share existing</span>
                    </Button>
                    <Button size="sm" onClick={() => setCreatingPortfolio(true)}>
                      <Plus className="h-4 w-4" strokeWidth={2} />
                      <span className="ml-1">New shared portfolio</span>
                    </Button>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {familyPortfolios.length === 0 ? (
                <div className="flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50/60 dark:border-amber-900/60 dark:bg-amber-950/30 px-3 py-2.5 text-sm">
                  <Info className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-medium text-amber-800 dark:text-amber-300">
                      No shared portfolios yet
                    </p>
                    <p className="text-xs text-amber-800/80 dark:text-amber-300/80 mt-0.5">
                      Contributors and viewers can only see own personal +
                      family-shared data (rule A). Until a shared portfolio exists
                      with transactions, the family dashboard shows zeros for
                      non-owners.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {familyPortfolios.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center gap-3 rounded-md border border-border/70 px-3 py-2"
                    >
                      <Briefcase className="h-4 w-4 text-accent" strokeWidth={1.9} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{p.name}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {p.currency} · {p.holdingCount} holdings ·{' '}
                          {p.transactionCount} transactions
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </Tabs>

      {/* Dialogs */}
      {editingMember && (
        editingMember.managed ? (
          <EditManagedMemberDialog
            familyId={family.id}
            member={editingMember}
            members={members}
            currentUserId={currentUserId}
            isOwner={isOwner}
            onClose={() => setEditingMember(null)}
          />
        ) : (
          <EditMemberDialog
            familyId={family.id}
            member={editingMember}
            members={members}
            currentUserId={currentUserId}
            onClose={() => setEditingMember(null)}
          />
        )
      )}
      {adding && isOwner && (
        <AddMemberDialog
          familyId={family.id}
          members={members}
          currentUserId={currentUserId}
          relatedToId={adding.relatedToId}
          onClose={() => setAdding(false)}
        />
      )}
      {creatingPortfolio && (isOwner || family.role === 'CONTRIBUTOR') && (
        <CreateFamilyPortfolioDialog
          familyId={family.id}
          onClose={() => setCreatingPortfolio(false)}
        />
      )}
      {sharingExisting && (isOwner || family.role === 'CONTRIBUTOR') && (
        <ShareExistingPortfolioDialog
          familyId={family.id}
          currentUserId={currentUserId}
          onClose={() => setSharingExisting(false)}
        />
      )}
    </div>
  );
}

/**
 * What is using the family's seats, in plain words.
 *
 * An invitation nobody has accepted holds a seat — otherwise a family could
 * invite any number of people past its seats and only pay when they all
 * accepted. That is defensible, and invisible: "you have 2 members, pay for
 * a third" reads as a bug unless the invitation is named here.
 */
function SeatLine({ seats }: { seats: SeatUsage }) {
  const parts = [`${seats.members} member${seats.members === 1 ? '' : 's'}`];
  if (seats.openInvitations > 0) {
    parts.push(
      `${seats.openInvitations} open invitation${seats.openInvitations === 1 ? '' : 's'}`,
    );
  }
  const full = seats.used >= seats.includedSeats;
  return (
    <p className={`mb-1 text-[11.5px] ${full ? 'text-warning' : 'text-muted-foreground'}`}>
      {seats.used} of {seats.includedSeats} seats used — {parts.join(', ')}
      {full && seats.openInvitations > 0 && '. Cancel an invitation to free one.'}
    </p>
  );
}

// ─── Overview tab (family dashboard) ─────────────────────────────────

/**
 * The household's financial picture. Four independent queries so a slow or
 * failing panel never blanks the others — each widget renders its own
 * loading/error/empty state, in the same shape AdvisorPage uses.
 *
 * Rendered only while the Overview tab is mounted (TabsContent unmounts the
 * inactive tab), so a user who lives on the Members tab never pays for four
 * dashboard requests.
 *
 * Each of the four payloads carries its own `hiddenMemberCount` — the members
 * whose slice of THAT endpoint the caller's grant hides — so every widget
 * reads the figure from its own data and none has to borrow another's.
 */
function FamilyOverviewTab({ familyId }: { familyId: string }) {
  const wealthQuery = useQuery({
    queryKey: familyDashboardKeys.wealth(familyId),
    queryFn: () => familyDashboardApi.wealth(familyId),
    staleTime: REFETCH_MS,
    refetchOnWindowFocus: true,
  });
  const goalsQuery = useQuery({
    queryKey: familyDashboardKeys.goals(familyId),
    queryFn: () => familyDashboardApi.goals(familyId),
    staleTime: REFETCH_MS,
    refetchOnWindowFocus: true,
  });
  const protectionQuery = useQuery({
    queryKey: familyDashboardKeys.protection(familyId),
    queryFn: () => familyDashboardApi.protection(familyId),
    staleTime: REFETCH_MS,
    refetchOnWindowFocus: true,
  });
  const attentionQuery = useQuery({
    queryKey: familyDashboardKeys.attention(familyId),
    queryFn: () => familyDashboardApi.attention(familyId),
    staleTime: REFETCH_MS,
    refetchOnWindowFocus: true,
  });

  return (
    <div className="space-y-6">
      <FamilyWealthCard
        data={wealthQuery.data}
        isLoading={wealthQuery.isLoading}
        isError={wealthQuery.isError}
      />

      <FamilyAttentionCard
        data={attentionQuery.data}
        isLoading={attentionQuery.isLoading}
        isError={attentionQuery.isError}
      />

      <FamilyGoalsCard
        data={goalsQuery.data}
        isLoading={goalsQuery.isLoading}
        isError={goalsQuery.isError}
      />

      <FamilyProtectionCard
        data={protectionQuery.data}
        isLoading={protectionQuery.isLoading}
        isError={protectionQuery.isError}
      />

      <p className="flex items-start gap-2.5 rounded-lg border border-border/60 bg-muted/25 px-3.5 py-3 text-[12.5px] leading-relaxed text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.8} />
        <span>
          Everything on this tab is filtered by the family permission model. What an
          OWNER sees and what a VIEWER sees are different numbers for the same
          household — where data is withheld from you, it is labelled, never
          quietly dropped.
        </span>
      </p>
    </div>
  );
}

// ─── Share existing portfolio ────────────────────────────────────────

function ShareExistingPortfolioDialog({
  familyId,
  currentUserId,
  onClose,
}: {
  familyId: string;
  currentUserId: string | undefined;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const portfoliosQuery = useQuery({
    queryKey: ['portfolios', 'own-personal', currentUserId],
    queryFn: () => portfoliosApi.list(),
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const shareMutation = useMutation({
    mutationFn: (portfolioId: string) => familiesApi.sharePortfolio(familyId, portfolioId),
    onSuccess: () => {
      toast.success('Portfolio shared with family');
      queryClient.invalidateQueries({ queryKey: ['portfolios'] });
      queryClient.invalidateQueries({
        queryKey: ['portfolios', 'family-shared', familyId],
      });
      onClose();
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Share failed')),
  });

  // Only show portfolios the caller owns AND are not already family-
  // shared (with any family). Callers can't share peer portfolios.
  const shareable = (portfoliosQuery.data ?? []).filter(
    (p) => p.userId === currentUserId && !p.familyId,
  );

  return (
    <ModalShell title="Share an existing portfolio" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Pick one of your own personal portfolios to attach to this family.
          The portfolio becomes visible to every active member and writable by
          OWNERs + CONTRIBUTORs. You can unshare it later.
        </p>
        {portfoliosQuery.isLoading ? (
          <div className="text-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground mx-auto" />
          </div>
        ) : shareable.length === 0 ? (
          <div className="rounded-md border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
            No personal portfolios available to share. Every portfolio you own
            is either already shared with a family or is a shared portfolio.
          </div>
        ) : (
          <div className="space-y-1.5 max-h-72 overflow-y-auto">
            {shareable.map((p) => (
              <label
                key={p.id}
                className={`flex items-center gap-3 rounded-md border px-3 py-2 cursor-pointer transition-colors ${
                  selectedId === p.id
                    ? 'border-accent bg-accent/5'
                    : 'border-border hover:bg-muted/50'
                }`}
              >
                <input
                  type="radio"
                  name="share-portfolio"
                  checked={selectedId === p.id}
                  onChange={() => setSelectedId(p.id)}
                />
                <Briefcase className="h-4 w-4 text-muted-foreground" strokeWidth={1.7} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{p.name}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {p.currency} · {p.holdingCount} holdings ·{' '}
                    {p.transactionCount} transactions
                  </div>
                </div>
              </label>
            ))}
          </div>
        )}
      </div>
      <ModalFooter>
        <Button variant="outline" onClick={onClose} disabled={shareMutation.isPending}>
          Cancel
        </Button>
        <Button
          onClick={() => selectedId && shareMutation.mutate(selectedId)}
          disabled={!selectedId || shareMutation.isPending}
        >
          {shareMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
          Share
        </Button>
      </ModalFooter>
    </ModalShell>
  );
}

// ─── Pending invitations list ────────────────────────────────────────

function PendingInvitationsList({
  familyId,
  invitations,
}: {
  familyId: string;
  invitations: NonNullable<
    Awaited<ReturnType<typeof familiesApi.pendingInvitations>>
  >;
}) {
  const queryClient = useQueryClient();
  const cancelMutation = useMutation({
    mutationFn: (invitationId: string) =>
      familiesApi.cancelInvitation(familyId, invitationId),
    onSuccess: () => {
      toast.success('Invitation cancelled');
      queryClient.invalidateQueries({ queryKey: ['families', familyId, 'invitations'] });
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Cancel failed')),
  });

  return (
    <div className="space-y-1.5">
      {invitations.map((inv) => (
        <div
          key={inv.id}
          className="flex items-center gap-2 px-3 py-2 rounded border border-border/70 text-sm"
        >
          <div className="flex-1 min-w-0">
            <div className="truncate">{inv.invitedEmail}</div>
            <div className="text-[11px] uppercase tracking-kerned text-muted-foreground">
              {inv.role.toLowerCase()} · expires{' '}
              {new Date(inv.expiresAt).toLocaleDateString('en-IN')}
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              if (confirm(`Cancel invitation for ${inv.invitedEmail}?`))
                cancelMutation.mutate(inv.id);
            }}
            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-negative"
            title="Cancel invitation"
          >
            <Trash2 className="h-3.5 w-3.5" strokeWidth={1.7} />
          </button>
        </div>
      ))}
    </div>
  );
}

// ─── Invite dialog ───────────────────────────────────────────────────

/**
 * Pay for one extra family seat when a new member would exceed the included
 * ones. Shared by both ways of adding someone: the member does not exist until
 * this payment verifies, so nobody is ever added "on credit".
 */
async function payForSeat(familyId: string, outcome: SeatPaymentRequiredResult) {
  toast(outcome.message, { icon: '💳', duration: 6000 });
  const payment = await openRazorpayCheckout({
    key: outcome.keyId,
    amount: outcome.amount,
    currency: outcome.currency,
    name: 'EveryPaisa',
    description: 'Extra family seat',
    order_id: outcome.orderId,
  });
  return familiesApi.verifySeatPayment(familyId, {
    pendingInviteId: outcome.pendingInviteId,
    razorpayOrderId: payment.razorpay_order_id,
    razorpayPaymentId: payment.razorpay_payment_id,
    razorpaySignature: payment.razorpay_signature,
  });
}

/**
 * Add a member, one of two ways, and always as somebody's relative. Someone
 * with an email is invited and signs in themselves. Someone without one — a
 * grandparent, a child — becomes a managed member that a family member keeps.
 *
 * Opened from a tree card, the relation is measured against that person.
 */
function AddMemberDialog({
  familyId,
  members,
  currentUserId,
  relatedToId,
  onClose,
}: {
  familyId: string;
  members: FamilyMemberRow[];
  currentUserId: string | undefined;
  /** The card this was opened from; defaults to you. */
  relatedToId?: string;
  onClose: () => void;
}) {
  // Adding someone directly is the common case — a grandparent, a child, a
  // spouse whose books the family already keeps. Inviting is for someone who
  // wants their own login now; it is the slower path, because nothing shows
  // on the tree until they accept.
  const [mode, setMode] = useState<'email' | 'managed'>('managed');
  // Once the invitation exists the dialog is about its email; switching to
  // "No email" then would abandon it, so the choice is no longer offered.
  const [committed, setCommitted] = useState(false);
  const anchor = members.find((m) => m.userId === relatedToId);
  const title =
    anchor && anchor.userId !== currentUserId
      ? `Add a relative of ${anchor.name}`
      : 'Add a family member';
  const [kin, setKin] = useState<RelationValue>({
    relatedToId: relatedToId ?? currentUserId ?? '',
    relation: '',
  });

  return (
    <ModalShell title={title} onClose={onClose}>
      {!committed && (
      <div role="radiogroup" aria-label="How to add them" className="mb-4 grid grid-cols-2 gap-2">
        {(
          [
            [
              'managed',
              'Add them now',
              'They appear on the tree straight away. Someone in the family keeps their books.',
            ],
            [
              'email',
              'Invite by email',
              'They sign in themselves. Nothing shows until they accept.',
            ],
          ] as const
        ).map(([key, t, hint]) => (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={mode === key}
            onClick={() => setMode(key)}
            className={`rounded-lg border px-3 py-2.5 text-left transition-colors focus-ring ${
              mode === key ? 'border-accent bg-accent/10' : 'border-border hover:bg-muted/50'
            }`}
          >
            <span className="block text-sm font-medium text-foreground">{t}</span>
            <span className="mt-0.5 block text-[11.5px] text-muted-foreground">{hint}</span>
          </button>
        ))}
      </div>
      )}
      {mode === 'email' ? (
        <InviteForm
          onInvited={() => setCommitted(true)}
          familyId={familyId}
          members={members}
          currentUserId={currentUserId}
          kin={kin}
          setKin={setKin}
          onClose={onClose}
        />
      ) : (
        <ManagedMemberForm
          onAdded={() => setCommitted(true)}
          familyId={familyId}
          members={members}
          currentUserId={currentUserId}
          kin={kin}
          setKin={setKin}
          onClose={onClose}
        />
      )}
    </ModalShell>
  );
}

function ManagedMemberForm({
  familyId,
  members,
  currentUserId,
  kin,
  setKin,
  onAdded,
  onClose,
}: {
  onAdded: () => void;
  familyId: string;
  members: FamilyMemberRow[];
  currentUserId: string | undefined;
  kin: RelationValue;
  setKin: (v: RelationValue) => void;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { enter } = useManageProfile();
  const [name, setName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [managerId, setManagerId] = useState(currentUserId ?? '');
  // They join straight away — there is no invitation to accept — so their
  // place in the family is chosen here rather than by them later.
  const [role, setRole] = useState<'CONTRIBUTOR' | 'VIEWER'>('CONTRIBUTOR');
  const [added, setAdded] = useState<{ userId: string; name: string; managerId: string } | null>(
    null,
  );

  // Anyone who can sign in may keep the books: a spouse, a sibling, you.
  const managers = members.filter((m) => m.status === 'ACTIVE' && !m.managed);

  const addMutation = useMutation({
    mutationFn: async () => {
      const outcome = await familiesApi.addManagedMember(familyId, {
        name: name.trim(),
        relation: kin.relation.trim() || undefined,
        relatedToId: kin.relation.trim() ? kin.relatedToId || undefined : undefined,
        managerId: managerId || undefined,
        role,
        contactEmail: contactEmail.trim() || undefined,
      });
      if (outcome.status === 'managed_added') return outcome;
      const paid = await payForSeat(familyId, outcome);
      if (paid.status !== 'managed_added') throw new Error('Unexpected seat result');
      return paid;
    },
    onSuccess: (res) => {
      toast.success(`${res.name} added to the family`);
      setAdded({ userId: res.userId, name: res.name, managerId });
      onAdded();
      queryClient.invalidateQueries({ queryKey: ['families', familyId, 'members'] });
      queryClient.invalidateQueries({ queryKey: ['families', 'mine'] });
      queryClient.invalidateQueries({ queryKey: ['family-tree-layout', familyId] });
      queryClient.invalidateQueries({ queryKey: ['managed-profiles'] });
      // They come with a portfolio of their own; the list shows it at once.
      queryClient.invalidateQueries({ queryKey: ['portfolios'] });
    },
    onError: (err) => {
      if (err instanceof Error && err.message === 'dismissed') return; // Razorpay modal closed
      toast.error(apiErrorMessage(err, 'Could not add them'));
    },
  });

  if (added) {
    const iManage = added.managerId === currentUserId;
    const managerName = managers.find((m) => m.userId === added.managerId)?.name;
    return (
      <>
        <div className="space-y-2 rounded-lg border border-border/70 bg-muted/30 px-4 py-3">
          <p className="text-sm font-medium text-foreground">{added.name} is on the tree.</p>
          <p className="text-[12.5px] leading-relaxed text-muted-foreground">
            {iManage
              ? 'Open their account to add their FDs, pension, insurance and anything else they hold. It stays theirs, separate from yours.'
              : `${managerName ?? 'Their manager'} can open their account from the menu at the top right and keep their books.`}
          </p>
        </div>
        <ModalFooter>
          <Button variant="outline" onClick={onClose}>
            Done
          </Button>
          {iManage && (
            <Button
              onClick={() => {
                onClose();
                void enter({ id: added.userId, name: added.name });
              }}
            >
              Open {added.name}’s account
            </Button>
          )}
        </ModalFooter>
      </>
    );
  }

  return (
    <>
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="managed-name">Their name</Label>
          <Input
            id="managed-name"
            autoFocus
            placeholder="e.g. Ramesh Kothari"
            value={name}
            maxLength={80}
            onChange={(e) => setName(e.target.value)}
            disabled={addMutation.isPending}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="managed-email">Their email (optional)</Label>
          <Input
            id="managed-email"
            type="email"
            placeholder="them@example.com"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
            disabled={addMutation.isPending}
          />
          <p className="text-[11.5px] leading-relaxed text-muted-foreground">
            Noted, not emailed. It saves you typing when you hand them the account later.
          </p>
        </div>
        <RelationPicker
          members={members}
          currentUserId={currentUserId}
          personName={name}
          value={kin}
          onChange={setKin}
          disabled={addMutation.isPending}
        />
        <div className="space-y-1.5">
          <Label htmlFor="managed-role">Their place in the family</Label>
          <select
            id="managed-role"
            className="w-full h-9 rounded-md border border-border bg-background text-sm px-2"
            value={role}
            onChange={(e) => setRole(e.target.value as 'CONTRIBUTOR' | 'VIEWER')}
            disabled={addMutation.isPending}
          >
            <option value="CONTRIBUTOR">Contributor — counted in the household</option>
            <option value="VIEWER">Viewer — listed, but kept to the side</option>
          </select>
          <p className="text-[11.5px] leading-relaxed text-muted-foreground">
            They join now; there is no invitation to accept. They never sign in, so this describes
            their place rather than granting them anything.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="managed-manager">Who keeps their books</Label>
          <select
            id="managed-manager"
            className="w-full h-9 rounded-md border border-border bg-background text-sm px-2"
            value={managerId}
            onChange={(e) => setManagerId(e.target.value)}
            disabled={addMutation.isPending}
          >
            {managers.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.userId === currentUserId ? `${m.name} (you)` : m.name}
              </option>
            ))}
          </select>
          <p className="text-[11.5px] leading-relaxed text-muted-foreground">
            Only this person can open their account. They can hand it to anyone else in the family
            later, and invite them to take it over once they have an email.
          </p>
        </div>
        <p className="rounded-md bg-muted/40 px-3 py-2 text-[11.5px] leading-relaxed text-muted-foreground">
          They take a family seat, the same as someone you invite.
        </p>
      </div>
      <ModalFooter>
        <Button variant="outline" onClick={onClose} disabled={addMutation.isPending}>
          Cancel
        </Button>
        <Button
          onClick={() => addMutation.mutate()}
          disabled={!name.trim() || !kin.relation.trim() || !managerId || addMutation.isPending}
        >
          {addMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
          Add to family
        </Button>
      </ModalFooter>
    </>
  );
}

function InviteForm({
  familyId,
  members,
  currentUserId,
  kin,
  setKin,
  onInvited,
  onClose,
}: {
  onInvited: () => void;
  familyId: string;
  members: FamilyMemberRow[];
  currentUserId: string | undefined;
  kin: RelationValue;
  setKin: (v: RelationValue) => void;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<FamilyRole>('CONTRIBUTOR');
  // Default to full access — restriction is opt-in (empty = allow all
  // per the getEffectiveScope semantics).
  const [visibleAssetClasses, setVisibleAssetClasses] = useState<string[]>([]);
  const [visibleCategories, setVisibleCategories] = useState<NonAcCategory[]>([]);
  const [invitationId, setInvitationId] = useState<string | null>(null);

  const inviteMutation = useMutation({
    mutationFn: async () => {
      const outcome = await familiesApi.invite(familyId, {
        invitedEmail: email.trim().toLowerCase(),
        invitedName: name.trim() || undefined,
        role,
        visibleAssetClasses,
        visibleCategories,
        relation: kin.relation.trim() || undefined,
        relatedToId: kin.relation.trim() ? kin.relatedToId || undefined : undefined,
      });
      if (outcome.status === 'invited') return outcome;
      // Seat-overage: this family is already at its included-seat cap.
      const paid = await payForSeat(familyId, outcome);
      if (paid.status !== 'invited') throw new Error('Unexpected seat result');
      return paid;
    },
    onSuccess: (res) => {
      setInvitationId(res.id);
      onInvited();
      queryClient.invalidateQueries({ queryKey: ['families', familyId, 'invitations'] });
      // An open invitation holds a seat — the header line says so.
      queryClient.invalidateQueries({ queryKey: ['families', 'mine'] });
    },
    onError: (err) => {
      if (err instanceof Error && err.message === 'dismissed') return; // Razorpay modal closed
      toast.error(apiErrorMessage(err, 'Invite failed'));
    },
  });

  // The invitation exists; now the email. Read, edit, send — or copy the
  // link from the same screen if they would rather send it themselves.
  if (invitationId) {
    return (
      <InviteEmailComposer
        source={{
          key: ['family-invite-email', familyId, invitationId],
          preview: (edits) => familyInviteEmailApi.preview(familyId, invitationId, edits),
          send: (edits) => familyInviteEmailApi.send(familyId, invitationId, edits),
        }}
        onDone={onClose}
      />
    );
  }

  return (
    <>
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="invite-name">Their name</Label>
            <Input
              id="invite-name"
              autoFocus
              placeholder="e.g. Neha Jain"
              value={name}
              maxLength={120}
              onChange={(e) => setName(e.target.value)}
              disabled={inviteMutation.isPending}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="invite-email">Email</Label>
            <Input
              id="invite-email"
              type="email"
              placeholder="member@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={inviteMutation.isPending}
            />
          </div>
        </div>
        <RelationPicker
          members={members}
          currentUserId={currentUserId}
          personName={name}
          value={kin}
          onChange={setKin}
          disabled={inviteMutation.isPending}
        />
        <div className="space-y-1.5">
          <Label>What they can do</Label>
          <select
            className="w-full h-9 rounded-md border border-border bg-background text-sm px-2"
            value={role}
            onChange={(e) => setRole(e.target.value as FamilyRole)}
            disabled={inviteMutation.isPending}
          >
            <option value="OWNER">Owner — sees everything, can manage the family</option>
            <option value="CONTRIBUTOR">Contributor — filtered view, can add to the family</option>
            <option value="VIEWER">Viewer — filtered view, read-only</option>
          </select>
        </div>
        <PermissionsMatrix
          visibleAssetClasses={visibleAssetClasses}
          setVisibleAssetClasses={setVisibleAssetClasses}
          visibleCategories={visibleCategories}
          setVisibleCategories={setVisibleCategories}
          disabled={role === 'OWNER'}
          note="Owners see everything. Leave both lists empty to give a contributor or viewer full visibility."
        />
      </div>
      <ModalFooter>
        <Button variant="outline" onClick={onClose} disabled={inviteMutation.isPending}>
          Cancel
        </Button>
        <Button
          onClick={() => inviteMutation.mutate()}
          disabled={!email.trim() || !kin.relation.trim() || inviteMutation.isPending}
        >
          {inviteMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
          Next: write the email
        </Button>
      </ModalFooter>
    </>
  );
}

// ─── Edit a managed member ───────────────────────────────────────────

/**
 * A managed member never signs in, so roles and visibility filters mean
 * nothing for them. What can change is how they are related and who keeps
 * their books. Owners can change both; the person keeping the books can hand
 * them to anyone else in the family, without being an owner.
 */
function EditManagedMemberDialog({
  familyId,
  member,
  members,
  currentUserId,
  isOwner,
  onClose,
}: {
  familyId: string;
  member: FamilyMemberRow;
  members: FamilyMemberRow[];
  currentUserId: string | undefined;
  isOwner: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [kin, setKin] = useState<RelationValue>({
    relatedToId: member.relatedTo?.id ?? currentUserId ?? '',
    relation: member.relation ?? '',
  });
  const [managerId, setManagerId] = useState(member.managedBy?.id ?? '');
  const managers = members.filter((m) => m.status === 'ACTIVE' && !m.managed);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const relationChanged =
        (member.relation ?? '') !== kin.relation.trim() ||
        (member.relatedTo?.id ?? '') !== kin.relatedToId;
      if (isOwner && relationChanged && kin.relation.trim()) {
        await familiesApi.updateMemberPermissions(familyId, member.userId, {
          relation: kin.relation.trim(),
          relatedToId: kin.relatedToId,
        });
      }
      if (managerId && managerId !== member.managedBy?.id) {
        await familiesApi.setManager(familyId, member.userId, managerId);
      }
    },
    onSuccess: () => {
      toast.success('Saved');
      queryClient.invalidateQueries({ queryKey: ['families', familyId, 'members'] });
      queryClient.invalidateQueries({ queryKey: ['family-tree-layout', familyId] });
      queryClient.invalidateQueries({ queryKey: ['managed-profiles'] });
      onClose();
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Update failed')),
  });

  return (
    <ModalShell
      title={`Edit ${member.name}`}
      subtitle={`Managed by ${member.managedBy?.name ?? 'nobody yet'}`}
      onClose={onClose}
    >
      <div className="space-y-4">
        {isOwner && (
          <RelationPicker
            members={members}
            currentUserId={currentUserId}
            personName={member.name}
            value={kin}
            onChange={setKin}
            excludeId={member.userId}
          />
        )}
        <div className="space-y-1.5">
          <Label htmlFor="edit-manager">Who keeps their books</Label>
          <select
            id="edit-manager"
            className="w-full h-9 rounded-md border border-border bg-background text-sm px-2"
            value={managerId}
            onChange={(e) => setManagerId(e.target.value)}
          >
            {!member.managedBy && <option value="">Choose someone</option>}
            {managers.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.userId === currentUserId ? `${m.name} (you)` : m.name}
              </option>
            ))}
          </select>
          <p className="text-[11.5px] leading-relaxed text-muted-foreground">
            Any member with their own login can keep them — they do not need to be an owner. Only
            that person can open the account, from the moment you save.
          </p>
        </div>
        <HandOverSection familyId={familyId} member={member} onDone={onClose} />
      </div>
      <ModalFooter>
        <Button variant="outline" onClick={onClose} disabled={saveMutation.isPending}>
          Cancel
        </Button>
        <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
          {saveMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
          Save
        </Button>
      </ModalFooter>
    </ModalShell>
  );
}

/**
 * Handing the account over, once they have an email of their own.
 *
 * The profile already holds their FDs, policies and history; this offers the
 * key to it rather than a second account. The email is sent from the app,
 * read and edited first, like every other invitation here.
 */
function HandOverSection({
  familyId,
  member,
  onDone,
}: {
  familyId: string;
  member: FamilyMemberRow;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState(member.contactEmail ?? '');
  const [invitationId, setInvitationId] = useState<string | null>(null);

  const invite = useMutation({
    mutationFn: () => familyClaimApi.invite(familyId, member.userId, email.trim().toLowerCase()),
    onSuccess: (res) => setInvitationId(res.invitationId),
    onError: (err) => toast.error(apiErrorMessage(err, 'Could not send that invitation')),
  });

  if (invitationId) {
    return (
      <div className="rounded-lg border border-border/70 p-3">
        <InviteEmailComposer
          source={{
            key: ['family-claim-email', familyId, invitationId],
            preview: (edits) => familyInviteEmailApi.preview(familyId, invitationId, edits),
            send: (edits) => familyInviteEmailApi.send(familyId, invitationId, edits),
          }}
          onDone={onDone}
        />
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border/70 px-3 py-2.5">
      {!open ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[12.5px] text-muted-foreground">
            Has {member.name} got an email now?
          </p>
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            Hand the account to them
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <Label htmlFor="claim-invite-email">Their email</Label>
          <div className="flex gap-2">
            <Input
              id="claim-invite-email"
              type="email"
              autoFocus
              placeholder="them@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={invite.isPending}
            />
            <Button
              size="sm"
              onClick={() => invite.mutate()}
              disabled={!email.trim() || invite.isPending}
            >
              {invite.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
              Next
            </Button>
          </div>
          <p className="text-[11.5px] leading-relaxed text-muted-foreground">
            They set a password and this account becomes theirs — the same holdings, the same place
            in the family. Nobody keeps their books for them after that.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Edit member dialog ──────────────────────────────────────────────

function EditMemberDialog({
  familyId,
  member,
  members,
  currentUserId,
  onClose,
}: {
  familyId: string;
  member: FamilyMemberRow;
  members: FamilyMemberRow[];
  currentUserId: string | undefined;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [role, setRole] = useState<FamilyRole>(member.role);
  const [visibleAssetClasses, setVisibleAssetClasses] = useState<string[]>(
    member.visibleAssetClasses,
  );
  const [visibleCategories, setVisibleCategories] = useState<NonAcCategory[]>(
    member.visibleCategories,
  );
  const [kin, setKin] = useState<RelationValue>({
    relatedToId: member.relatedTo?.id ?? currentUserId ?? '',
    relation: member.relation ?? '',
  });

  const saveMutation = useMutation({
    mutationFn: () => {
      const relationChanged =
        (member.relation ?? '') !== kin.relation.trim() ||
        (member.relatedTo?.id ?? '') !== kin.relatedToId;
      return familiesApi.updateMemberPermissions(familyId, member.userId, {
        role,
        visibleAssetClasses,
        visibleCategories,
        ...(relationChanged && kin.relation.trim()
          ? { relation: kin.relation.trim(), relatedToId: kin.relatedToId }
          : {}),
      });
    },
    onSuccess: () => {
      toast.success('Saved');
      queryClient.invalidateQueries({ queryKey: ['families', familyId, 'members'] });
      queryClient.invalidateQueries({ queryKey: ['family-tree-layout', familyId] });
      queryClient.invalidateQueries({ queryKey: ['families', 'mine'] });
      onClose();
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Update failed')),
  });

  return (
    <ModalShell title={`Edit ${member.name}`} subtitle={member.email ?? undefined} onClose={onClose}>
      <div className="space-y-4">
        <RelationPicker
          members={members}
          currentUserId={currentUserId}
          personName={member.name}
          value={kin}
          onChange={setKin}
          excludeId={member.userId}
        />
        <div className="space-y-1.5">
          <Label>What they can do</Label>
          <select
            className="w-full h-9 rounded-md border border-border bg-background text-sm px-2"
            value={role}
            onChange={(e) => setRole(e.target.value as FamilyRole)}
          >
            <option value="OWNER">Owner — sees everything, can manage the family</option>
            <option value="CONTRIBUTOR">Contributor — filtered view, can add to the family</option>
            <option value="VIEWER">Viewer — filtered view, read-only</option>
          </select>
        </div>
        <PermissionsMatrix
          visibleAssetClasses={visibleAssetClasses}
          setVisibleAssetClasses={setVisibleAssetClasses}
          visibleCategories={visibleCategories}
          setVisibleCategories={setVisibleCategories}
          disabled={role === 'OWNER'}
          note="Owners see everything. Empty lists mean no restriction."
        />
      </div>
      <ModalFooter>
        <Button variant="outline" onClick={onClose} disabled={saveMutation.isPending}>
          Cancel
        </Button>
        <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
          {saveMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
          Save
        </Button>
      </ModalFooter>
    </ModalShell>
  );
}

// ─── Permissions matrix (shared between invite + edit) ───────────────

function PermissionsMatrix({
  visibleAssetClasses,
  setVisibleAssetClasses,
  visibleCategories,
  setVisibleCategories,
  disabled,
  note,
}: {
  visibleAssetClasses: string[];
  setVisibleAssetClasses: (v: string[]) => void;
  visibleCategories: NonAcCategory[];
  setVisibleCategories: (v: NonAcCategory[]) => void;
  disabled: boolean;
  note?: string;
}) {
  const acAllOn = visibleAssetClasses.length === ALL_ASSET_CLASSES.length;
  const acAllOff = visibleAssetClasses.length === 0;
  const catAllOn = visibleCategories.length === NON_AC_CATEGORIES.length;
  const catAllOff = visibleCategories.length === 0;

  const sortedClasses = useMemo(() => [...ALL_ASSET_CLASSES].sort(), []);

  return (
    <div className={disabled ? 'opacity-50 pointer-events-none' : ''}>
      {note && (
        <p className="text-[11px] text-muted-foreground mb-3 flex items-start gap-1.5">
          <Info className="h-3 w-3 mt-0.5 flex-shrink-0" strokeWidth={2} />
          {note}
        </p>
      )}

      {/* Asset classes */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-1.5">
          <Label>
            Asset classes ({visibleAssetClasses.length}/{ALL_ASSET_CLASSES.length})
          </Label>
          <div className="flex gap-2 text-[11px]">
            <button
              type="button"
              onClick={() =>
                setVisibleAssetClasses(acAllOn ? [] : [...ALL_ASSET_CLASSES])
              }
              className="text-accent hover:underline"
            >
              {acAllOn ? 'None' : 'All'}
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-1 max-h-56 overflow-y-auto border border-border rounded p-2">
          {sortedClasses.map((ac) => (
            <label
              key={ac}
              className="flex items-center gap-1.5 text-xs cursor-pointer hover:text-foreground"
            >
              <input
                type="checkbox"
                checked={visibleAssetClasses.includes(ac)}
                onChange={(e) =>
                  setVisibleAssetClasses(
                    e.target.checked
                      ? [...visibleAssetClasses, ac]
                      : visibleAssetClasses.filter((x) => x !== ac),
                  )
                }
              />
              <span className="truncate">{ASSET_CLASS_LABEL[ac] ?? ac}</span>
            </label>
          ))}
        </div>
        <p className="text-[10px] text-muted-foreground mt-1">
          Empty = no restriction. Check specific classes to whitelist them.
        </p>
      </div>

      {/* Categories */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <Label>
            Non-portfolio categories ({visibleCategories.length}/
            {NON_AC_CATEGORIES.length})
          </Label>
          <div className="flex gap-2 text-[11px]">
            <button
              type="button"
              onClick={() =>
                setVisibleCategories(
                  catAllOn ? [] : ([...NON_AC_CATEGORIES] as NonAcCategory[]),
                )
              }
              className="text-accent hover:underline"
            >
              {catAllOn ? 'None' : 'All'}
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 border border-border rounded p-2">
          {NON_AC_CATEGORIES.map((c) => (
            <label
              key={c}
              className="flex items-center gap-1.5 text-xs cursor-pointer hover:text-foreground"
            >
              <input
                type="checkbox"
                checked={visibleCategories.includes(c)}
                onChange={(e) =>
                  setVisibleCategories(
                    e.target.checked
                      ? [...visibleCategories, c]
                      : visibleCategories.filter((x) => x !== c),
                  )
                }
              />
              <span className="truncate">{NON_AC_CATEGORY_LABEL[c] ?? c}</span>
            </label>
          ))}
        </div>
        {catAllOff && (
          <p className="text-[10px] text-muted-foreground mt-1">
            Empty = no restriction (member sees vehicles, insurance, loans, etc.).
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Create family portfolio ─────────────────────────────────────────

function CreateFamilyPortfolioDialog({
  familyId,
  onClose,
}: {
  familyId: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [currency, setCurrency] = useState('INR');

  const createMutation = useMutation({
    mutationFn: () =>
      familiesApi.createFamilyPortfolio(familyId, {
        name: name.trim(),
        description: description.trim() || undefined,
        currency,
      }),
    onSuccess: () => {
      toast.success('Shared portfolio created');
      queryClient.invalidateQueries({ queryKey: ['portfolios'] });
      queryClient.invalidateQueries({
        queryKey: ['portfolios', 'family-shared', familyId],
      });
      onClose();
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Create failed')),
  });

  return (
    <ModalShell title="Create shared portfolio" onClose={onClose}>
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="fp-name">Name</Label>
          <Input
            id="fp-name"
            autoFocus
            placeholder="e.g. HUF Investments"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={createMutation.isPending}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="fp-desc">Description (optional)</Label>
          <Input
            id="fp-desc"
            placeholder="What's in this pot?"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={createMutation.isPending}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="fp-ccy">Currency</Label>
          <Input
            id="fp-ccy"
            value={currency}
            onChange={(e) => setCurrency(e.target.value.toUpperCase().slice(0, 3))}
            disabled={createMutation.isPending}
          />
        </div>
        <p className="text-[11px] text-muted-foreground">
          Shared portfolios are visible to every active family member. OWNERs
          and CONTRIBUTORs can write to them; VIEWERs can only read.
        </p>
      </div>
      <ModalFooter>
        <Button variant="outline" onClick={onClose} disabled={createMutation.isPending}>
          Cancel
        </Button>
        <Button
          onClick={() => createMutation.mutate()}
          disabled={!name.trim() || createMutation.isPending}
        >
          {createMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
          Create
        </Button>
      </ModalFooter>
    </ModalShell>
  );
}

// ─── Modal shell ─────────────────────────────────────────────────────

function ModalShell({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-lg border border-border bg-card shadow-lg"
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <div>
            <div className="text-sm font-semibold">{title}</div>
            {subtitle && (
              <div className="text-[11px] text-muted-foreground">{subtitle}</div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-muted text-muted-foreground"
          >
            <X className="h-4 w-4" strokeWidth={1.7} />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

function ModalFooter({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border -mx-5 -mb-4 mt-4">
      {children}
    </div>
  );
}
