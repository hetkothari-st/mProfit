import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Loader2, Users, UserPlus, Trash2, Copy } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  familiesApi,
  NON_AC_CATEGORIES,
  type FamilyRole,
  type MyFamily,
} from '@/api/families.api';
import { apiErrorMessage } from '@/api/client';

/**
 * Family / HOF settings section. Compact CRUD:
 *   - Create a new family (caller becomes OWNER).
 *   - Pick a family to manage.
 *   - List members, invite new member, edit role + visibility, revoke.
 *   - Cancel pending invitations.
 *
 * OWNER-gated buttons are hidden when the caller's role in the selected
 * family isn't OWNER. Server-side guards backstop the UI in
 * family.service.ts.
 */
export function FamilySection() {
  const queryClient = useQueryClient();
  const familiesQuery = useQuery({
    queryKey: ['families', 'mine'],
    queryFn: () => familiesApi.list(),
  });
  const families = familiesQuery.data ?? [];

  const [selectedFamilyId, setSelectedFamilyId] = useState<string | null>(null);
  const selected = families.find((f) => f.id === selectedFamilyId) ?? null;

  const [newFamilyName, setNewFamilyName] = useState('');
  const createFamilyMutation = useMutation({
    mutationFn: (name: string) => familiesApi.create({ name }),
    onSuccess: (res) => {
      toast.success('Family created');
      setNewFamilyName('');
      setSelectedFamilyId(res.id);
      queryClient.invalidateQueries({ queryKey: ['families', 'mine'] });
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Create failed')),
  });

  return (
    <Card>
      <CardHeader className="flex-row items-center gap-2">
        <Users className="h-4 w-4 text-accent" strokeWidth={1.9} />
        <CardTitle>Family</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Create family */}
        <div className="space-y-2">
          <Label htmlFor="family-name">Create a new family</Label>
          <div className="flex gap-2">
            <Input
              id="family-name"
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
          </div>
          <p className="text-xs text-muted-foreground">
            You become the OWNER. Add other OWNERs later for joint families.
          </p>
        </div>

        {/* Existing families */}
        {familiesQuery.isLoading ? (
          <div className="text-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground mx-auto" />
          </div>
        ) : families.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            You are not part of any family yet. Create one above, or accept an
            invitation from a family OWNER.
          </p>
        ) : (
          <div className="space-y-2">
            <p className="text-[10px] uppercase tracking-kerned text-muted-foreground">
              Your families
            </p>
            {families.map((f) => (
              <FamilyRow
                key={f.id}
                family={f}
                selected={selectedFamilyId === f.id}
                onSelect={() =>
                  setSelectedFamilyId(selectedFamilyId === f.id ? null : f.id)
                }
              />
            ))}
          </div>
        )}

        {/* Detail: members + invites */}
        {selected && <FamilyDetail family={selected} />}
      </CardContent>
    </Card>
  );
}

function FamilyRow({
  family,
  selected,
  onSelect,
}: {
  family: MyFamily;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={`w-full flex items-center gap-3 px-3 py-2 rounded-md border text-left transition-colors ${
        selected
          ? 'border-accent bg-accent/5'
          : 'border-border hover:bg-muted/50'
      }`}
    >
      <Users className="h-4 w-4 text-muted-foreground" strokeWidth={1.7} />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{family.name}</div>
        <div className="text-[11px] uppercase tracking-kerned text-muted-foreground">
          {family.role.toLowerCase()} · {family.status.toLowerCase()}
        </div>
      </div>
    </button>
  );
}

function FamilyDetail({ family }: { family: MyFamily }) {
  const queryClient = useQueryClient();
  const isOwner = family.role === 'OWNER';

  const membersQuery = useQuery({
    queryKey: ['families', family.id, 'members'],
    queryFn: () => familiesApi.members(family.id),
  });
  const pendingQuery = useQuery({
    queryKey: ['families', family.id, 'invitations'],
    queryFn: () => familiesApi.pendingInvitations(family.id),
    enabled: isOwner,
  });

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<FamilyRole>('CONTRIBUTOR');
  const [inviteCategories, setInviteCategories] = useState<string[]>([
    ...NON_AC_CATEGORIES,
  ]);
  const [lastInviteToken, setLastInviteToken] = useState<string | null>(null);

  const inviteMutation = useMutation({
    mutationFn: () =>
      familiesApi.invite(family.id, {
        invitedEmail: inviteEmail.trim().toLowerCase(),
        role: inviteRole,
        visibleCategories: inviteCategories as never,
      }),
    onSuccess: (res) => {
      toast.success('Invitation created');
      setInviteEmail('');
      setLastInviteToken(res.token);
      queryClient.invalidateQueries({ queryKey: ['families', family.id, 'invitations'] });
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Invite failed')),
  });

  const revokeMutation = useMutation({
    mutationFn: (memberUserId: string) =>
      familiesApi.revokeMember(family.id, memberUserId),
    onSuccess: () => {
      toast.success('Member revoked');
      queryClient.invalidateQueries({ queryKey: ['families', family.id, 'members'] });
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Revoke failed')),
  });

  const cancelInviteMutation = useMutation({
    mutationFn: (invitationId: string) =>
      familiesApi.cancelInvitation(family.id, invitationId),
    onSuccess: () => {
      toast.success('Invitation cancelled');
      queryClient.invalidateQueries({ queryKey: ['families', family.id, 'invitations'] });
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Cancel failed')),
  });

  const roleMutation = useMutation({
    mutationFn: (input: { memberUserId: string; role: FamilyRole }) =>
      familiesApi.updateMemberPermissions(family.id, input.memberUserId, {
        role: input.role,
      }),
    onSuccess: () => {
      toast.success('Role updated');
      queryClient.invalidateQueries({ queryKey: ['families', family.id, 'members'] });
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Update failed')),
  });

  const copyInviteLink = (token: string) => {
    const url = `${window.location.origin}/families/invitations/${token}/accept`;
    void navigator.clipboard.writeText(url);
    toast.success('Invite link copied');
  };

  return (
    <div className="mt-4 pt-4 border-t border-border space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">{family.name}</p>
        <span className="text-[10px] uppercase tracking-kerned text-muted-foreground">
          Your role: {family.role.toLowerCase()}
        </span>
      </div>

      {/* Members */}
      <div>
        <p className="text-[10px] uppercase tracking-kerned text-muted-foreground mb-1.5">
          Members
        </p>
        {membersQuery.isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : (
          <div className="space-y-1.5">
            {(membersQuery.data ?? []).map((m) => (
              <div
                key={m.id}
                className="flex items-center gap-2 px-2.5 py-1.5 rounded border border-border/70 text-sm"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{m.name}</div>
                  <div className="text-[11px] text-muted-foreground truncate">
                    {m.email}
                  </div>
                </div>
                {isOwner && m.status === 'ACTIVE' ? (
                  <select
                    className="h-7 rounded border border-border bg-background text-[11px] px-1.5"
                    value={m.role}
                    onChange={(e) =>
                      roleMutation.mutate({
                        memberUserId: m.userId,
                        role: e.target.value as FamilyRole,
                      })
                    }
                    disabled={roleMutation.isPending}
                  >
                    <option value="OWNER">OWNER</option>
                    <option value="CONTRIBUTOR">CONTRIBUTOR</option>
                    <option value="VIEWER">VIEWER</option>
                  </select>
                ) : (
                  <span className="text-[10px] uppercase tracking-kerned text-muted-foreground">
                    {m.role.toLowerCase()}
                  </span>
                )}
                <span className="text-[10px] uppercase tracking-kerned text-muted-foreground">
                  {m.status.toLowerCase()}
                </span>
                {isOwner && m.status === 'ACTIVE' && (
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm(`Revoke ${m.name}'s access?`)) {
                        revokeMutation.mutate(m.userId);
                      }
                    }}
                    className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-negative"
                    title="Revoke access"
                  >
                    <Trash2 className="h-3.5 w-3.5" strokeWidth={1.7} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Invite */}
      {isOwner && (
        <div className="space-y-2">
          <p className="text-[10px] uppercase tracking-kerned text-muted-foreground">
            Invite a member
          </p>
          <div className="flex gap-2">
            <Input
              type="email"
              placeholder="member@example.com"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              className="flex-1"
              disabled={inviteMutation.isPending}
            />
            <select
              className="h-9 rounded-md border border-border bg-background text-sm px-2"
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as FamilyRole)}
              disabled={inviteMutation.isPending}
            >
              <option value="OWNER">OWNER</option>
              <option value="CONTRIBUTOR">CONTRIBUTOR</option>
              <option value="VIEWER">VIEWER</option>
            </select>
            <Button
              size="sm"
              onClick={() => inviteMutation.mutate()}
              disabled={!inviteEmail.trim() || inviteMutation.isPending}
            >
              {inviteMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <UserPlus className="h-4 w-4" strokeWidth={1.7} />
              )}
              <span className="ml-1">Invite</span>
            </Button>
          </div>
          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground">
              Visibility (categories) · {inviteCategories.length}/
              {NON_AC_CATEGORIES.length}
            </summary>
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              {NON_AC_CATEGORIES.map((c) => (
                <label key={c} className="flex items-center gap-1.5 text-xs">
                  <input
                    type="checkbox"
                    checked={inviteCategories.includes(c)}
                    onChange={(e) =>
                      setInviteCategories((prev) =>
                        e.target.checked
                          ? [...prev, c]
                          : prev.filter((x) => x !== c),
                      )
                    }
                  />
                  {c.replace(/_/g, ' ').toLowerCase()}
                </label>
              ))}
            </div>
          </details>
          {lastInviteToken && (
            <div className="flex items-center gap-2 rounded border border-border/70 bg-muted/40 px-3 py-2">
              <p className="text-xs text-muted-foreground flex-1 truncate">
                Share this link with the invitee:
              </p>
              <button
                type="button"
                onClick={() => copyInviteLink(lastInviteToken)}
                className="text-[11px] flex items-center gap-1 text-accent hover:underline"
              >
                <Copy className="h-3 w-3" strokeWidth={1.9} /> Copy
              </button>
            </div>
          )}
        </div>
      )}

      {/* Pending invitations */}
      {isOwner && (pendingQuery.data?.length ?? 0) > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-kerned text-muted-foreground mb-1.5">
            Pending invitations
          </p>
          <div className="space-y-1.5">
            {(pendingQuery.data ?? []).map((inv) => (
              <div
                key={inv.id}
                className="flex items-center gap-2 px-2.5 py-1.5 rounded border border-border/70 text-sm"
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
                    if (confirm(`Cancel invitation for ${inv.invitedEmail}?`)) {
                      cancelInviteMutation.mutate(inv.id);
                    }
                  }}
                  className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-negative"
                  title="Cancel invitation"
                >
                  <Trash2 className="h-3.5 w-3.5" strokeWidth={1.7} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
