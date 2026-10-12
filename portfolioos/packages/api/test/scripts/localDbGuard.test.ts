import { describe, it, expect } from 'vitest';
import { isLocalDatabaseUrl } from '../../scripts/localDbGuard.js';

describe('isLocalDatabaseUrl', () => {
  it.each([
    'postgresql://u:p@localhost:5432/db',
    'postgresql://u:p@127.0.0.1:5432/db',
    'postgresql://u:p@[::1]:5432/db',
    'postgresql://u:p@localhost:5432/db?schema=public&host=127.0.0.1',
    'postgresql://u:p@localhost:5432/db?hostaddr=::1',
  ])('accepts %s', (url) => expect(isLocalDatabaseUrl(url)).toBe(true));

  it.each([
    'postgresql://u:p@localhost:5432/db?host=prod.example.com',
    'postgresql://u:p@localhost:5432/db?HOST=prod.example.com',
    'postgresql://u:p@localhost:5432/db?hostaddr=10.0.0.5',
    'postgresql://u:p@localhost:5432/db?host=localhost,prod.example.com',
    'postgresql://u:p@db.example.com:5432/db?host=localhost',
    'postgresql://u:p@localhost.evil.com/db',
    'not a url',
    '',
  ])('refuses %s', (url) => expect(isLocalDatabaseUrl(url)).toBe(false));
});
