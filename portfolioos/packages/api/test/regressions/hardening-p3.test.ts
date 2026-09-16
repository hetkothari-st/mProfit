import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { requireRole, SELF_ASSIGNABLE_ROLES } from '../../src/middleware/authenticate.js';

/**
 * Lower-severity hardening from the security sweep. Each is small, and each
 * is a control that existed only by convention until now.
 */

const ROOT = join(__dirname, '..', '..');
const SRC = join(ROOT, 'src');
const read = (rel: string) => readFileSync(join(SRC, rel), 'utf8');

describe('SEC-35: self-assignable roles cannot gate anything', () => {
  it('refuses a self-assignable role at definition time', () => {
    for (const role of SELF_ASSIGNABLE_ROLES) {
      expect(() => requireRole(role), role).toThrow(/self-assignable/);
    }
  });

  it('still allows ADMIN, which cannot be self-assigned', () => {
    expect(() => requireRole('ADMIN')).not.toThrow();
  });

  it('refuses a mix that includes a self-assignable role', () => {
    expect(() => requireRole('ADMIN', 'CA')).toThrow(/CA/);
  });

  it('ADMIN is not in the self-assignable set', () => {
    expect(SELF_ASSIGNABLE_ROLES.has('ADMIN')).toBe(false);
  });
});

describe('SEC-34: login does not reveal whether an account exists by timing', () => {
  const svc = read('services/auth.service.ts');

  it('runs a password comparison on the unknown-user path', () => {
    const body = svc.slice(svc.indexOf('export async function loginUser'));
    const unknownBranch = body.slice(0, body.indexOf("throw new UnauthorizedError('Invalid credentials');"));
    expect(unknownBranch).toContain('verifyPassword(password, await getDummyPasswordHash())');
  });

  it('generates the dummy hash rather than hardcoding one', () => {
    // A malformed hardcoded hash makes bcrypt.compare return instantly,
    // silently reopening the gap.
    expect(svc).toContain('hashPassword(crypto.randomBytes(32)');
    expect(svc).not.toMatch(/\$2[aby]\$\d\d\$[./A-Za-z0-9]{53}/);
  });
});

describe('SEC-36: auto-commit threshold is enforced server-side', () => {
  it('rejects enabling auto-commit before enough confirmed events', () => {
    const c = read('controllers/monitoredSenders.controller.ts');
    expect(c).toContain('body.autoCommitEnabled === true');
    expect(c).toContain('existing.confirmedEventCount < existing.autoCommitAfter');
  });
});

describe('SEC-32: the API container does not run as root', () => {
  it('drops to the unprivileged node user', () => {
    const dockerfile = readFileSync(join(ROOT, 'Dockerfile'), 'utf8');
    const runtime = dockerfile.slice(dockerfile.lastIndexOf('FROM '));
    expect(runtime).toMatch(/^USER node$/m);
    // USER must come before the process starts.
    expect(runtime.indexOf('USER node')).toBeLessThan(runtime.indexOf('CMD'));
  });
});

describe('SEC-28: untrusted spreadsheets are not parsed with npm xlsx', () => {
  it('the excel parser no longer imports xlsx', () => {
    expect(read('services/imports/parsers/genericExcel.parser.ts')).not.toContain("from 'xlsx'");
  });

  it('xlsx is not a production dependency', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>;
    };
    expect(pkg.dependencies.xlsx).toBeUndefined();
  });

  it('multer is on the maintained 2.x line', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>;
    };
    expect(pkg.dependencies.multer).toMatch(/^\^?2\./);
  });
});

describe('SEC-39: extension PF payloads resolve to the caller only', () => {
  const svc = read('services/pfAccounts.service.ts');

  it('scopes resolution to the authenticated user', () => {
    const fn = svc.slice(svc.indexOf('export async function resolveEpfoAccountForExtension'));
    expect(fn).toContain("where: { userId, institution: 'EPFO' }");
  });

  it('refuses an ambiguous match instead of guessing', () => {
    expect(svc).toContain('matches.length === 1 ? matches[0]! : null');
    expect(svc).toContain('accounts.length === 1 ? accounts[0]! : null');
  });
});
