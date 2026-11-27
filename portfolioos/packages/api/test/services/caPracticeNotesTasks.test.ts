import { describe, it, expect, afterEach } from 'vitest';
import { createTestScope, prisma, type TestScope } from '../helpers/db.js';
import { runAsSystem, runAsUser } from '../../src/lib/requestContext.js';
import { inviteProfessional, acceptProfessionalInvitation } from '../../src/services/ca/caAccess.service.js';
import {
  addNote,
  listNotes,
  updateNote,
  deleteNote,
  addTask,
  listTasks,
  updateTask,
  listMyOpenTasks,
} from '../../src/services/ca/caPractice.service.js';

/** The CA's own notes and to-dos per client: practice-private. */

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!();
});

async function person(label: string): Promise<TestScope & { email: string }> {
  const scope = await createTestScope(label);
  cleanups.push(scope.cleanup);
  const user = await runAsSystem(() =>
    prisma.user.findUniqueOrThrow({ where: { id: scope.userId }, select: { email: true } }),
  );
  return { ...scope, email: user.email };
}

async function grant(client: TestScope, ca: TestScope & { email: string }, name: string): Promise<string> {
  await runAsSystem(() => prisma.user.update({ where: { id: client.userId }, data: { name } }));
  const { client: row, token } = await runAsUser(client.userId, () =>
    inviteProfessional(client.userId, { name: 'Our CA', email: ca.email }),
  );
  cleanups.push(async () => {
    await runAsSystem(async () => {
      await prisma.caAuditLog.deleteMany({ where: { clientId: row.id } });
      await prisma.client.deleteMany({ where: { id: row.id } });
    });
  });
  await runAsUser(ca.userId, () => acceptProfessionalInvitation(ca.userId, ca.email, token));
  return row.id;
}

describe('client notes', () => {
  it('the CA writes, pins, edits and deletes notes; pinned first', async () => {
    const ca = await person('cpn-ca');
    const asha = await person('cpn-asha');
    const clientId = await grant(asha, ca, 'Asha Verma');

    const first = await runAsUser(ca.userId, () => addNote(ca.userId, clientId, { body: 'Has a second house in Pune.' }));
    const second = await runAsUser(ca.userId, () => addNote(ca.userId, clientId, { body: 'Prefers WhatsApp.' }));
    await runAsUser(ca.userId, () => updateNote(ca.userId, clientId, first.id, { pinned: true }));
    await runAsUser(ca.userId, () => updateNote(ca.userId, clientId, second.id, { body: 'Prefers a call.' }));

    const notes = await runAsUser(ca.userId, () => listNotes(ca.userId, clientId));
    expect(notes.map((n) => [n.body, n.pinned])).toEqual([
      ['Has a second house in Pune.', true],
      ['Prefers a call.', false],
    ]);

    await runAsUser(ca.userId, () => deleteNote(ca.userId, clientId, second.id));
    expect(await runAsUser(ca.userId, () => listNotes(ca.userId, clientId))).toHaveLength(1);
  });

  it('are private to the CA: the client and other CAs see nothing', async () => {
    const ca = await person('cpn-priv-ca');
    const other = await person('cpn-priv-other');
    const asha = await person('cpn-priv-asha');
    const clientId = await grant(asha, ca, 'Asha Verma');
    await runAsUser(ca.userId, () => addNote(ca.userId, clientId, { body: 'Private' }));

    expect(await runAsUser(asha.userId, () => prisma.clientNote.count({ where: { clientId } }))).toBe(0);
    expect(await runAsUser(other.userId, () => prisma.clientNote.count({ where: { clientId } }))).toBe(0);
    await expect(runAsUser(other.userId, () => listNotes(other.userId, clientId))).rejects.toThrow();
    await expect(runAsUser(other.userId, () => addNote(other.userId, clientId, { body: 'x' }))).rejects.toThrow();
  });

  it('refuses an empty note', async () => {
    const ca = await person('cpn-empty-ca');
    const asha = await person('cpn-empty-asha');
    const clientId = await grant(asha, ca, 'Asha Verma');
    await expect(runAsUser(ca.userId, () => addNote(ca.userId, clientId, { body: '   ' }))).rejects.toThrow();
  });
});

describe('client tasks', () => {
  it('tracks to-dos per client and lists open ones across clients by due date', async () => {
    const ca = await person('cpt-ca');
    const asha = await person('cpt-asha');
    const ravi = await person('cpt-ravi');
    const ashaId = await grant(asha, ca, 'Asha Verma');
    const raviId = await grant(ravi, ca, 'Ravi Nair');

    const form16 = await runAsUser(ca.userId, () =>
      addTask(ca.userId, ashaId, { title: 'Collect Form 16', dueDate: '2026-06-15' }),
    );
    await runAsUser(ca.userId, () => addTask(ca.userId, raviId, { title: 'File ITR', dueDate: '2026-06-10' }));
    await runAsUser(ca.userId, () => addTask(ca.userId, ashaId, { title: 'Call about rent' }));

    const open = await runAsUser(ca.userId, () => listMyOpenTasks(ca.userId));
    expect(open.map((t) => [t.title, t.clientName])).toEqual([
      ['File ITR', 'Ravi Nair'],
      ['Collect Form 16', 'Asha Verma'],
      ['Call about rent', 'Asha Verma'],
    ]);

    await runAsUser(ca.userId, () => updateTask(ca.userId, ashaId, form16.id, { status: 'DONE' }));
    const ashaTasks = await runAsUser(ca.userId, () => listTasks(ca.userId, ashaId));
    expect(ashaTasks.find((t) => t.id === form16.id)).toMatchObject({ status: 'DONE' });
    expect(ashaTasks.find((t) => t.id === form16.id)!.doneAt).not.toBeNull();
    expect((await runAsUser(ca.userId, () => listMyOpenTasks(ca.userId))).map((t) => t.title)).not.toContain(
      'Collect Form 16',
    );
  });

  it('are private to the CA', async () => {
    const ca = await person('cpt-priv-ca');
    const asha = await person('cpt-priv-asha');
    const clientId = await grant(asha, ca, 'Asha Verma');
    await runAsUser(ca.userId, () => addTask(ca.userId, clientId, { title: 'Private' }));
    expect(await runAsUser(asha.userId, () => prisma.clientTask.count({ where: { clientId } }))).toBe(0);
  });
});
