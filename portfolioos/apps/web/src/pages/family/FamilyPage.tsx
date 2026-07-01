import { useState, useMemo, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  Loader2,
  Users,
  UserPlus,
  Trash2,
  Copy,
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
import { EmptyState } from '@/components/common/EmptyState';
import {
  familiesApi,
  NON_AC_CATEGORIES,
  type FamilyMemberRow,
  type FamilyRole,
  type NonAcCategory,
} from '@/api/families.api';
import { portfoliosApi } from '@/api/portfolios.api';
import { apiErrorMessage } from '@/api/client';
import { useAuthStore } from '@/stores/auth.store';
import { useFamilyScopeStore } from '@/stores/familyScope.store';
import { FamilyTreeCanvas } from '@/components/family/FamilyTreeCanvas';
import {
  ALL_ASSET_CLASSES,
  ASSET_CLASS_LABEL,
  NON_AC_CATEGORY_LABEL,
} from '@/lib/assetClasses';

/**
 * Dedicated Family management page.
 *
 * Full-page canvas instead of a cramped Settings section, because the
 * feature has real weight — visual tree + members + invitations +
 * shared portfolios + per-member permission matrix. Separate route
 * (`/family`) linked from the Overview nav.
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
    queryClient.clear();
    toast.success(`Viewing as ${familyName}`);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Family"
        title="Households and shared portfolios"
        description="Manage family memberships, permissions, and shared portfolios. Owners see everything; contributors and viewers see own personal + family-shared, filtered per their role."
        actions={
          <Button size="sm" onClick={() => setCreatingFamily(true)}>
            <Plus className="h-4 w-4" strokeWidth={2} />
            <span className="ml-1">New family</span>
          </Button>
        }
      />

      {creatingFamily && (
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
  family: { id: string; name: string; role: FamilyRole; description: string | null };
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
  const [inviting, setInviting] = useState(false);
  const [creatingPortfolio, setCreatingPortfolio] = useState(false);
  const [sharingExisting, setSharingExisting] = useState(false);

  const revokeMutation = useMutation({
    mutationFn: (memberUserId: string) =>
      familiesApi.revokeMember(family.id, memberUserId),
    onSuccess: () => {
      toast.success('Member revoked');
      queryClient.invalidateQueries({ queryKey: ['families', family.id, 'members'] });
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Revoke failed')),
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

      {/* Tree */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle>Family tree</CardTitle>
            {isOwner && (
              <Button size="sm" onClick={() => setInviting(true)}>
                <UserPlus className="h-4 w-4" strokeWidth={1.9} />
                <span className="ml-1">Invite</span>
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
              onRevoke={(m) => {
                if (confirm(`Revoke ${m.name}'s access?`))
                  revokeMutation.mutate(m.userId);
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

      {/* Dialogs */}
      {editingMember && (
        <EditMemberDialog
          familyId={family.id}
          member={editingMember}
          onClose={() => setEditingMember(null)}
        />
      )}
      {inviting && isOwner && (
        <InviteDialog familyId={family.id} onClose={() => setInviting(false)} />
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

function InviteDialog({
  familyId,
  onClose,
}: {
  familyId: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<FamilyRole>('CONTRIBUTOR');
  // Default to full access — restriction is opt-in (empty = allow all
  // per the getEffectiveScope semantics).
  const [visibleAssetClasses, setVisibleAssetClasses] = useState<string[]>([]);
  const [visibleCategories, setVisibleCategories] = useState<NonAcCategory[]>([]);
  const [lastToken, setLastToken] = useState<string | null>(null);

  const inviteMutation = useMutation({
    mutationFn: () =>
      familiesApi.invite(familyId, {
        invitedEmail: email.trim().toLowerCase(),
        role,
        visibleAssetClasses,
        visibleCategories,
      }),
    onSuccess: (res) => {
      toast.success('Invitation created');
      setLastToken(res.token);
      queryClient.invalidateQueries({ queryKey: ['families', familyId, 'invitations'] });
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Invite failed')),
  });

  const copyLink = (token: string) => {
    const url = `${window.location.origin}/families/invitations/${token}/accept`;
    void navigator.clipboard.writeText(url);
    toast.success('Invite link copied');
  };

  return (
    <ModalShell title="Invite a member" onClose={onClose}>
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="invite-email">Email</Label>
          <Input
            id="invite-email"
            type="email"
            autoFocus
            placeholder="member@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={inviteMutation.isPending}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Role</Label>
          <select
            className="w-full h-9 rounded-md border border-border bg-background text-sm px-2"
            value={role}
            onChange={(e) => setRole(e.target.value as FamilyRole)}
            disabled={inviteMutation.isPending}
          >
            <option value="OWNER">OWNER — full visibility, can manage family</option>
            <option value="CONTRIBUTOR">
              CONTRIBUTOR — filtered view, can write to family
            </option>
            <option value="VIEWER">VIEWER — filtered view, read-only</option>
          </select>
        </div>
        <PermissionsMatrix
          visibleAssetClasses={visibleAssetClasses}
          setVisibleAssetClasses={setVisibleAssetClasses}
          visibleCategories={visibleCategories}
          setVisibleCategories={setVisibleCategories}
          disabled={role === 'OWNER'}
          note="OWNERs bypass these filters. Leave both lists empty to grant full visibility to a contributor or viewer."
        />
        {lastToken && (
          <div className="flex items-center gap-2 rounded border border-border/70 bg-muted/40 px-3 py-2">
            <p className="text-xs text-muted-foreground flex-1 truncate">
              Share this link with the invitee:
            </p>
            <button
              type="button"
              onClick={() => copyLink(lastToken)}
              className="text-[11px] flex items-center gap-1 text-accent hover:underline"
            >
              <Copy className="h-3 w-3" strokeWidth={1.9} /> Copy
            </button>
          </div>
        )}
      </div>
      <ModalFooter>
        <Button variant="outline" onClick={onClose} disabled={inviteMutation.isPending}>
          {lastToken ? 'Done' : 'Cancel'}
        </Button>
        {!lastToken && (
          <Button
            onClick={() => inviteMutation.mutate()}
            disabled={!email.trim() || inviteMutation.isPending}
          >
            {inviteMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
            Send invite
          </Button>
        )}
      </ModalFooter>
    </ModalShell>
  );
}

// ─── Edit member dialog ──────────────────────────────────────────────

function EditMemberDialog({
  familyId,
  member,
  onClose,
}: {
  familyId: string;
  member: FamilyMemberRow;
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

  const saveMutation = useMutation({
    mutationFn: () =>
      familiesApi.updateMemberPermissions(familyId, member.userId, {
        role,
        visibleAssetClasses,
        visibleCategories,
      }),
    onSuccess: () => {
      toast.success('Permissions updated');
      queryClient.invalidateQueries({ queryKey: ['families', familyId, 'members'] });
      queryClient.invalidateQueries({ queryKey: ['families', 'mine'] });
      onClose();
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Update failed')),
  });

  return (
    <ModalShell
      title={`Edit ${member.name}`}
      subtitle={member.email}
      onClose={onClose}
    >
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label>Role</Label>
          <select
            className="w-full h-9 rounded-md border border-border bg-background text-sm px-2"
            value={role}
            onChange={(e) => setRole(e.target.value as FamilyRole)}
          >
            <option value="OWNER">OWNER — full visibility, can manage family</option>
            <option value="CONTRIBUTOR">
              CONTRIBUTOR — filtered view, can write to family
            </option>
            <option value="VIEWER">VIEWER — filtered view, read-only</option>
          </select>
        </div>
        <PermissionsMatrix
          visibleAssetClasses={visibleAssetClasses}
          setVisibleAssetClasses={setVisibleAssetClasses}
          visibleCategories={visibleCategories}
          setVisibleCategories={setVisibleCategories}
          disabled={role === 'OWNER'}
          note="OWNERs bypass the visibility filters. Empty lists = no restriction (member sees everything they're eligible to see)."
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
