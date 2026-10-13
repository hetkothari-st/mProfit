/**
 * Step 9 wording (Will Maker spec, "Parts" and step 9). The two links are the
 * verified official sites named in the spec; keep their wording in step with it.
 */
export const WILL_SIGNING_STEPS: ReadonlyArray<{ title: string; body: string }> = [
  {
    title: 'Print the will',
    body: 'Download the PDF and print every page on plain paper. A will does not need stamp paper.',
  },
  {
    title: 'Read it once more',
    body: 'Check the names, the shares and the executor. If anything is wrong, start a new version instead of writing on the printout.',
  },
  {
    title: 'Choose two witnesses',
    body: 'Two adults of sound mind who are not beneficiaries and are not the husband or wife of a beneficiary. A gift to a witness, or to a witness\'s husband or wife, can fail.',
  },
  {
    title: 'Sign in front of both witnesses',
    body: 'Sign at the end and initial every page while both witnesses watch. Then each witness signs in front of you and writes their name and address. Write the date and the place.',
  },
  {
    title: 'Register it with the Sub-Registrar (optional)',
    body: 'Registration under the Registration Act, 1908 is optional, but a registered will is harder to dispute. Take the original, your ID and both witnesses with their IDs to the Sub-Registrar for your area; the fee is small and varies by state.',
  },
  {
    title: 'Store it safely',
    body: 'Keep the original somewhere safe, tell your executor where it is, and store a scan below so you always have a copy.',
  },
];

export const WILL_LAWYER_LINKS: ReadonlyArray<{ name: string; by: string; url: string; body: string }> = [
  {
    name: 'Tele-Law',
    by: 'Government of India, Department of Justice',
    url: 'https://www.tele-law.in/',
    body: 'Legal advice from a panel lawyer by phone or video, including through the Tele-Law citizens\' mobile app. Free for eligible people; otherwise a small fee.',
  },
  {
    name: 'NALSA',
    by: 'National Legal Services Authority',
    url: 'https://nalsa.gov.in/',
    body: 'Free legal aid for people who qualify. Call the helpline or apply online for legal aid.',
  },
];

export const NALSA_HELPLINE = '15100';

export const WILL_BAR_COUNCIL_NOTE =
  'Choosing a private advocate? Ask for their enrolment number and check it with the State Bar Council of your state.';

export const WILL_WITNESS_BENEFICIARY_WARNING =
  'One of your witnesses has the same name as a beneficiary. Under Indian law a gift to a witness, or to a witness\'s husband or wife, can fail, although the rest of the will stands. Speak to a lawyer; you may want to sign again with two other witnesses.';

/** Which form field a server issue path belongs to. */
export type SignedCopyField = 'date' | 'w1' | 'w2' | 'file';

export function issueField(path: string): SignedCopyField {
  if (path === 'witnesses.0') return 'w1';
  if (path.startsWith('witnesses')) return 'w2';
  if (path === 'executedOn') return 'date';
  return 'file';
}

/** The fields whose edit can fix an issue: two different witnesses can be fixed by changing either name. */
export function issueFields(issue: { path: string; code: string }): SignedCopyField[] {
  return issue.code === 'duplicate_witness' ? ['w1', 'w2'] : [issueField(issue.path)];
}

/** Plain sentences for the 422 codes of POST /api/will/wills/:id/execution. */
export function issueMessage(issue: { path: string; code: string }): string {
  switch (issue.code) {
    case 'witness_is_testator':
      return 'You cannot be a witness to your own will. Choose someone else.';
    case 'duplicate_witness':
      return 'Your two witnesses must be two different people.';
    case 'in_future':
      return 'The signing date cannot be in the future.';
    case 'before_generated':
      return 'The signing date cannot be before the will was generated.';
    default:
      if (issue.path === 'executedOn') return 'Enter a valid signing date.';
      if (issue.path.startsWith('witnesses')) return 'Enter the full name of both witnesses.';
      return 'Some signing details are not valid. Check them and try again.';
  }
}
