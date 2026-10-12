import { describe, it, expect } from 'vitest';
import { createTestScope, prisma } from '../helpers/db.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import { encryptSecret } from '../../src/lib/secrets.js';
import { purgeUser } from '../../src/services/accountDeletion.service.js';
import { startOwnerStepUp } from '../../src/services/legacy/tokens.service.js';

describe('account purge removes Legacy data', () => {
  it('deletes plan, nominees and owner step-up codes', async () => {
    const s = await createTestScope('legacy-purge');
    const planId = (await runAsSystem(() => prisma.legacyPlan.create({ data: { userId: s.userId, status: 'ARMED' } }))).id;
    await runAsSystem(() => prisma.legacyNominee.create({ data: {
      planId, userId: s.userId, nameEnc: encryptSecret('N'), emailEnc: encryptSecret('n@test.local'),
      relationship: 'x', priority: 1, categories: ['INSURANCE'],
    } }));
    await startOwnerStepUp(s.userId); // owner code row: no FK to User, so no cascade
    await runAsSystem(() => purgeUser(s.userId));
    expect(await runAsSystem(() => prisma.legacyPlan.count({ where: { userId: s.userId } }))).toBe(0);
    expect(await runAsSystem(() => prisma.legacyNominee.count({ where: { userId: s.userId } }))).toBe(0);
    expect(await runAsSystem(() => prisma.legacyCode.count({ where: { userId: s.userId } }))).toBe(0);
  });
});
