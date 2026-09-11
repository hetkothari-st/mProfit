import { describe, it, expect } from 'vitest';
import { parseTallyImportResponse } from '../../../src/services/tally/tallyResponse.js';

// Tally's own verdict on an import (Case Study I, help.tallysolutions.com):
// <RESPONSE> with CREATED / ALTERED / COMBINED / IGNORED / ERRORS counts, and
// a LINEERROR per rejected entry. Used by scripts/tallyVerify.ts to prove a
// file imports cleanly into a real TallyPrime.

describe('parseTallyImportResponse', () => {
  it('reads the counts Tally returns', () => {
    const r = parseTallyImportResponse(
      '<RESPONSE><CREATED>3</CREATED><ALTERED>0</ALTERED><LASTVCHID>0</LASTVCHID><LASTMID>0</LASTMID>' +
        '<COMBINED>0</COMBINED><IGNORED>1</IGNORED><ERRORS>0</ERRORS></RESPONSE>',
    );
    expect(r).toEqual({ created: 3, altered: 0, combined: 0, ignored: 1, errors: 0, exceptions: 0, lineErrors: [], ok: true });
  });

  it('collects line errors and marks the import failed', () => {
    const r = parseTallyImportResponse(
      '<RESPONSE><LINEERROR>Ledger &apos;X&apos; does not exist!</LINEERROR><CREATED>0</CREATED><ERRORS>1</ERRORS></RESPONSE>',
    );
    expect(r.ok).toBe(false);
    expect(r.errors).toBe(1);
    expect(r.lineErrors).toEqual(["Ledger 'X' does not exist!"]);
  });

  it('treats exceptions as a failure', () => {
    const r = parseTallyImportResponse('<RESPONSE><CREATED>2</CREATED><ERRORS>0</ERRORS><EXCEPTIONS>1</EXCEPTIONS></RESPONSE>');
    expect(r).toMatchObject({ created: 2, exceptions: 1, ok: false });
  });

  it('fails when the reply is not an import response at all', () => {
    expect(parseTallyImportResponse('<ENVELOPE><HEADER><STATUS>0</STATUS></HEADER></ENVELOPE>').ok).toBe(false);
  });
});
