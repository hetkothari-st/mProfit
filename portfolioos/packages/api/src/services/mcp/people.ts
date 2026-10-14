import { AREA_CATEGORY, type AiConnectorArea, type AiConnectorMemberWire } from '@everypaisa/shared';
import type { AssetClass } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { runAsSystem } from '../../lib/requestContext.js';
import { getEffectiveScope } from '../familyScope.service.js';
import { listMembers, listMyFamilies } from '../family.service.js';
import { listProfilesIManage, resolveActAs } from '../family/managedProfile.service.js';

/**
 * Whose data a connector grant may read (spec section 7.2). Re-resolved on
 * every tool call: nothing here is cached, so removing someone from a family,
 * handing a managed profile over or switching opt-in off takes effect on the
 * very next call even though the grant still lists them.
 */
export interface Person {
  userId: string;
  label: string;
  relation: string;
  kind: 'self' | 'managed' | 'member';
  /** Family visibility caps for a member; null = unrestricted. Self and managed are unrestricted. */
  caps: { assetClasses: AssetClass[] | null; categories: string[] | null };
}

const OPEN = { assetClasses: null, categories: null };
const NOT_OPTED_IN = 'Has not allowed family AI connectors';

export function selfPerson(userId: string): Person {
  return { userId, label: 'You', relation: 'self', kind: 'self', caps: OPEN };
}

async function optedIn(userIds: string[]): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();
  const rows = await runAsSystem(() => prisma.user.findMany({
    where: { id: { in: userIds }, aiConnectorFamilyOptIn: true }, select: { id: true },
  }));
  return new Set(rows.map((r) => r.id));
}

async function managedProfiles(userId: string) {
  return (await listProfilesIManage(userId)).map((p) => ({ userId: p.id, name: p.name, relation: p.relation ?? 'Family' }));
}

/** Own-login family members visible to the user, with the scope (caps) of the family they share. */
async function familyMembers(userId: string) {
  const out = new Map<string, { name: string; relation: string; caps: Person['caps'] }>();
  for (const f of await listMyFamilies(userId)) {
    if (f.status !== 'ACTIVE') continue;
    const scope = await getEffectiveScope(userId, { familyId: f.id });
    const caps = { assetClasses: scope.allowedAssetClasses, categories: scope.allowedCategories as string[] | null };
    for (const m of await listMembers(userId, f.id)) {
      if (m.userId === userId || m.managed || m.status !== 'ACTIVE' || !scope.readableUserIds.includes(m.userId)) continue;
      const prev = out.get(m.userId);
      // A person in two of the user's families: the most open view wins.
      const open = caps.assetClasses === null && caps.categories === null;
      if (!prev || open) out.set(m.userId, { name: m.name, relation: m.relation ?? 'Family', caps });
    }
  }
  return out;
}

/** Approval page: everyone the user could share, with why a person cannot be. */
export async function listShareablePeople(userId: string): Promise<AiConnectorMemberWire[]> {
  const managed = await managedProfiles(userId);
  const managedIds = new Set(managed.map((m) => m.userId));
  const members = [...(await familyMembers(userId)).entries()].filter(([id]) => !managedIds.has(id));
  const opted = await optedIn(members.map(([id]) => id));
  return [
    ...managed.map((m) => ({ userId: m.userId, name: m.name, relation: m.relation, kind: 'managed' as const, shareable: true })),
    ...members.map(([id, m]) => ({
      userId: id, name: m.name, relation: m.relation, kind: 'member' as const,
      shareable: opted.has(id), ...(opted.has(id) ? {} : { reason: NOT_OPTED_IN }),
    })),
  ];
}

/** Self first, then every listed person who is still eligible right now. */
export async function resolvePeople(userId: string, memberUserIds: readonly string[]): Promise<Person[]> {
  const people: Person[] = [selfPerson(userId)];
  if (memberUserIds.length === 0) return people;
  const wanted = new Set(memberUserIds);
  const managed = (await managedProfiles(userId)).filter((m) => wanted.has(m.userId));
  const manager = await runAsSystem(() => prisma.user.findUnique({ where: { id: userId }, select: { plan: true } }));
  for (const m of managed) {
    try {
      // Same check X-Act-As uses: the caller must still manage this profile.
      await resolveActAs({ id: userId, plan: manager?.plan ?? 'FREE' }, m.userId);
      people.push({ userId: m.userId, label: m.name, relation: m.relation, kind: 'managed', caps: OPEN });
      wanted.delete(m.userId);
    } catch {
      // No longer managed by this user: dropped, exactly like a revoked member.
      wanted.delete(m.userId);
    }
  }
  if (wanted.size === 0) return people;
  const members = await familyMembers(userId);
  const opted = await optedIn([...wanted]);
  for (const id of memberUserIds) {
    const m = members.get(id);
    if (wanted.has(id) && m && opted.has(id)) people.push({ userId: id, label: m.name, relation: m.relation, kind: 'member', caps: m.caps });
  }
  return people;
}

/** May this person's data in `area` be read at all (possibly filtered)? */
export function areaAllowedFor(person: Person, area: AiConnectorArea | 'always'): boolean {
  if (person.kind !== 'member' || area === 'always') return true;
  const gate = AREA_CATEGORY[area];
  if (gate === null) return false;
  if (gate === 'ASSET_CLASSES') return person.caps.assetClasses === null || person.caps.assetClasses.length > 0;
  return person.caps.categories === null || gate.some((c) => person.caps.categories!.includes(c));
}

/** Can a whole-area total be shown (no per-row filtering possible)? */
export function areaWholeFor(person: Person, area: AiConnectorArea): boolean {
  if (person.kind !== 'member') return true;
  if (AREA_CATEGORY[area] === 'ASSET_CLASSES') return person.caps.assetClasses === null;
  return areaAllowedFor(person, area);
}
