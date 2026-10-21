import type { KnowledgeEntry, KnowledgeSource } from '../library.js';

const SRC: KnowledgeSource = {
  kind: 'NISM',
  series: 'X-B',
  edition: '2025-12',
  chapter: 15,
  chapterTitle: 'Tools for Estate Planning',
};

export const XB_15: readonly KnowledgeEntry[] = [
  {
    id: 'xb-15-wills-basics',
    title: 'Wills: why write one, and who can',
    principle:
      'A will is the legal declaration of what the testator wants done with their property after death; the legatee receives under it and the executor administers it. It avoids family confusion, lets the testator address special needs, minors or a widowed daughter that intestacy law ignores, exclude someone, appoint a trusted executor (intestate administrators must post bonds), create trusts and name guardians. Any adult of sound mind may make one, including married women (for property they can alienate), and deaf, mute or blind people who understand what they are doing; someone usually insane may make one in a lucid interval; no one may while intoxicated or too ill to understand. It must be made with knowledge of its contents, voluntarily and free of fraud, coercion or undue influence. It takes effect only at death, stays confidential, and can be changed or revoked any time while competent.',
    source: SRC,
    topics: ['estate'],
    keywords: ['will', 'why write a will', 'testator', 'executor', 'legatee', 'who can make a will', 'valid will requirements', 'sound mind'],
  },
  {
    id: 'xb-15-will-types',
    title: 'Kinds of wills',
    principle:
      'Conditional or contingent (effective only if a condition occurs; an unlawful condition voids it). Joint (by two or more people, treated as separate wills, typically effective after both die) and mutual (each gives the other reciprocal benefits). Duplicate (a signed, attested copy, often with the executor; destroying the testator’s copy revokes both). Holograph (entirely handwritten by the testator). Concurrent (separate wills for property in different countries, probated independently unless linked). Sham (executed with formalities but without real testamentary intent, so void). Privileged (oral or informal wills by soldiers, airmen or mariners in active service before two witnesses) versus unprivileged (all others, which must be in writing).',
    source: SRC,
    topics: ['estate'],
    keywords: ['types of will', 'joint will', 'mutual will', 'holograph will', 'handwritten will', 'conditional will', 'privileged will', 'concurrent will'],
  },
  {
    id: 'xb-15-will-registration-revocation',
    title: 'Registering, changing and revoking a will',
    principle:
      'Registration is optional; an unregistered will is valid. Registering at the sub-registrar (with witnesses; officials can visit the infirm) protects it from tampering, loss or theft, needs no stamp duty, and limits certified copies to the testator or, after death, applicants producing a death certificate; a sealed will can also be deposited with the registrar. Later wills and codicils need not be registered. Bequests by non-Hindus to religious or charitable bodies are valid only if the will is deposited within six months and the testator lives twelve months after making it. A codicil makes small changes and must be executed and attested like a will; major changes need a fresh will.',
    inPractice:
      'Revocation: by a later will or codicil, a written declaration executed like a will, or deliberately destroying it; mere loss does not revoke. For Hindus, marriage does not revoke a will; for others under the Succession Act a later marriage does; divorce does not.',
    source: SRC,
    topics: ['estate'],
    keywords: ['register a will', 'will registration optional', 'codicil', 'revoke will', 'change will', 'will deposit registrar', 'marriage revokes will'],
  },
  {
    id: 'xb-15-executor-administrator',
    title: 'Executors and administrators',
    principle:
      'The executor named in the will gathers the estate: pays funeral expenses, obtains the death certificate, traces and values every asset, applies for probate where needed, pays debts and taxes (creditors come first, selling assets if necessary), then distributes as the will directs, and may manage a minor’s inheritance until majority; they are liable for mismanagement. Anyone able to make a will can be an executor, including beneficiaries, companies and several people together. Executors may refuse before acting but, once they accept, only a court can release them. Where no executor is named, or the named one refuses, is incapable or dies before finishing, the court appoints an administrator through letters of administration.',
    inPractice:
      'A minor executor cannot get probate until adult (the guardian may get letters of administration meanwhile); a person of unsound mind cannot act. An executor who is also a legatee must act as executor to claim the legacy.',
    source: SRC,
    topics: ['estate'],
    keywords: ['executor duties', 'who can be executor', 'administrator', 'letters of administration', 'executor refuse', 'executor liability'],
  },
  {
    id: 'xb-15-probate-succession-certificate',
    title: 'Probate, succession certificates and legal heir certificates',
    principle:
      'Probate is a court-sealed copy of a will confirming its validity and the executor’s authority. It is mandatory where the will was made in, or concerns immovable property in, Kolkata or the municipal limits of Chennai and Mumbai; elsewhere optional, though often needed to transfer property or prove rights. The executor petitions with the will, verified by an attesting witness; the court notifies legal heirs and advertises publicly, objections are heard, and death, due execution and that it is the last will must be proved; court fees vary by state. Without a will, heirs obtain a succession certificate from a civil (district) court to collect debts and securities (bank deposits, shares, PF, insurance); it does not decide title. A legal heir certificate, issued by the tehsildar, only identifies living heirs (for pensions, service dues, smaller claims) and is not conclusive.',
    source: SRC,
    topics: ['estate'],
    keywords: ['probate', 'probate mandatory Mumbai', 'succession certificate', 'legal heir certificate', 'difference probate succession certificate', 'probate process'],
  },
  {
    id: 'xb-15-gifts-joint-nomination',
    title: 'Gifts, joint holding and nomination as estate tools',
    principle:
      'A gift is a voluntary transfer without consideration by someone able to contract, normally irrevocable; gifts from relatives, on marriage or by will are tax-free for the recipient, but later income on the asset is taxed to the recipient (subject to clubbing). Immovable property gifts need a registered deed with stamp duty (some states charge less for close relatives); they transfer immediately, cutting later litigation risk. Joint holding (jointly, either-or-survivor, anyone-or-survivor) gives survivors easy access, but succession law can override it if heirs dispute. Nomination simplifies payment on death, but a will overrides it and nominees usually hold for the legal heirs, except where a specific law makes them owners (spouse, parents or children as beneficial nominees of life policies; EPF family nominees).',
    inPractice:
      'Only individuals nominate (not HUF Kartas, companies or PoA holders); minors can be nominees through guardians; several nominees with percentages are allowed (up to 10 in securities from 2025).',
    source: SRC,
    asOf: '2025-12',
    topics: ['estate', 'tax'],
    keywords: ['gift deed', 'gift to children property', 'joint holding survivor', 'nomination vs will', 'nominee rights', 'who can nominate', 'either or survivor'],
  },
  {
    id: 'xb-15-family-settlement-business',
    title: 'Family settlements and family-business succession',
    principle:
      'A family settlement resolves rival claims among family members with a genuine interest in property, voluntarily and in good faith, to avoid litigation; it may be oral or written (stamped and registered if needed) and is not treated as a transfer, a gift or clubbable income. Transfers within families can use joint ownership, gifts (stamp duty applies on property), or wills and inheritance (no tax to heirs; mutation needed; the original owner’s cost applies on later sale). Family businesses often fail to survive generations; tools include transferring early, giving non-working members non-voting or other non-control interests, ESOPs, partial sales to fund the older generation, and trusts.',
    inPractice:
      'Ownership models: owner-operator, partnership among active members, distributed to all descendants, nested branches, or partly public. Valuation methods: capitalised earnings, projected (discounted cash flow) earnings, market comparables, net asset value.',
    source: SRC,
    topics: ['estate', 'planning'],
    keywords: ['family settlement', 'family arrangement tax', 'family business succession', 'intra family transfer', 'business valuation methods', 'family business ownership models'],
  },
  {
    id: 'xb-15-tenancy-asset-protection',
    title: 'Joint tenancy, tenancy in common and asset protection',
    principle:
      'Joint tenants acquire identical interests at the same time in one transaction and have survivorship: a deceased tenant’s share passes automatically to the survivors and cannot be willed (only the last survivor can bequeath). Tenants in common hold undivided shares (equal unless stated) without survivorship, so each share passes by will or succession law, and each can deal with their share freely. Asset protection shields wealth from creditors, depending on who the debtor and creditor are, the nature of the claim and the asset (PPF, for instance, cannot be attached). Strategies: running businesses through companies or LLPs, irrevocable asset-protection trusts (the settlor gives up control), or transferring ownership to others (risky, and void if done to defraud creditors).',
    inPractice:
      'Since 2016 the Insolvency and Bankruptcy Code gives creditors time-bound resolution, after the slower DRT, SARFAESI and credit-bureau regimes.',
    source: SRC,
    topics: ['estate', 'real-estate', 'debt'],
    keywords: ['joint tenancy', 'tenancy in common', 'right of survivorship', 'asset protection', 'protect assets from creditors', 'PPF cannot be attached', 'IBC creditors'],
  },
  {
    id: 'xb-15-trust-basics',
    title: 'Private trusts: parties, essentials, pros and cons',
    principle:
      'Under the Indian Trusts Act 1882 a trust is an obligation attached to property: the author (settlor) places confidence in a trustee, who holds legal title for the beneficiaries under the trust instrument. A trust is created when the settlor clearly indicates intent, purpose, beneficiaries and property and transfers it to the trustee (unless created by will or the settlor is trustee). Oral trusts are possible for movables; immovables need a written deed. Uses: family welfare, charity, employee funds, minors, elderly parents, incapacity, keeping ownership private and avoiding probate. Benefits: fewer disputes, orderly preservation and distribution over generations, privacy. Drawbacks: complexity and cost, stamp duty on property, loss of the settlor’s control, trustees limited by the deed.',
    inPractice:
      'A trust cannot accumulate or postpone vesting indefinitely (rule against perpetuities; accumulation limited to the transferor’s life or 18 years), except for public charitable purposes.',
    source: SRC,
    topics: ['estate'],
    keywords: ['private trust', 'family trust', 'Indian Trusts Act', 'settlor trustee beneficiary', 'trust deed', 'advantages of trust', 'rule against perpetuity'],
  },
  {
    id: 'xb-15-trust-types-tax',
    title: 'Types of trust and how they are taxed',
    principle:
      'Public trusts (charitable or religious, also under state laws) get exemptions under sections 11 to 13. Private trusts: revocable (settlor can alter or end it; income taxed to the settlor, and transfers into it attract capital gains) versus irrevocable (default unless the deed reserves revocation; transfers into it are not transfers for capital gains). Determinate (specific) trusts state each beneficiary’s share; the trustee is taxed as representative at each beneficiary’s own rates. Discretionary trusts leave shares to the trustees and are taxed at the maximum marginal rate, except when no beneficiary has income above the exemption limit or another trust, or for the only will-made trust for dependent relatives.',
    inPractice:
      'Business income in a private trust pushes all its income to the maximum rate unless it is that sole will-made trust for dependants. Hybrid trusts mix fixed and discretionary parts; public-cum-private trusts are taxed as private on the private part. A trust for minors still faces clubbing unless the child is disabled.',
    source: SRC,
    topics: ['estate', 'tax'],
    keywords: ['discretionary trust tax', 'determinate trust', 'revocable trust tax', 'irrevocable trust', 'trust maximum marginal rate', 'specific trust', 'trust capital gains'],
  },
  {
    id: 'xb-15-trust-vs-will-stamp-offshore',
    title: 'Trust versus will, stamp duty, and offshore trusts',
    principle:
      'A will acts only at death, covers property in one’s name then, may need probate (court oversight) and can become public; it names guardians. A trust acts from creation, covers only property transferred to it, can distribute before, at or after death, avoids probate, stays private and helps with disability and tax planning; the two work together. Stamp duty applies to a lifetime trust deed settling immovable property (state rates), not to distributions to beneficiaries, and not to property settled by will. Offshore trusts are formed under foreign law for cross-border families: revocable ones are taxed as the settlor’s income; irrevocable ones are taxed through the trustee if all beneficiaries are Indian residents, otherwise Indian beneficiaries pay on distributions; one managed partly from India may be taxed as an AOP.',
    inPractice: 'Indian residents must report offshore trust interests in their tax return.',
    source: SRC,
    topics: ['estate', 'tax'],
    keywords: ['trust vs will', 'living trust India', 'avoid probate trust', 'stamp duty trust deed', 'offshore trust tax', 'foreign trust reporting'],
  },
  {
    id: 'xb-15-guardianship-poa',
    title: 'Guardianship and powers of attorney in estate planning',
    principle:
      'A guardian of the person looks after care; a guardian of the estate manages finances; both owe fiduciary duties. Guardians are natural (parents until 18), court-appointed (for those with no parent who cannot decide for themselves, including adults with disabilities) or testamentary (named by will, mostly for minors). Applicants must be adult Indian citizens; a legal guardian is needed to operate bank accounts, invest or claim benefits for an incapacitated adult. A power of attorney lets a donor authorise a donee: general (broad), special (one matter, ending when done), or special for registration of a document. It ends on revocation, renunciation, completion, insolvency or death of either party (a PoA coupled with the agent’s interest cannot be revoked without consent).',
    inPractice:
      'Donors must be adult and sound; a minor can be a donee but not a lunatic. A PoA is authenticated before a notary or consul, needs registration only if it creates an interest in immovable property, carries state stamp duty, and can be signed abroad before Indian embassy officials. Agents cannot exceed the deed or delegate.',
    source: SRC,
    topics: ['estate'],
    keywords: ['guardianship', 'legal guardian disabled adult', 'testamentary guardian', 'power of attorney types', 'general vs special power of attorney', 'revoke power of attorney', 'NRI power of attorney'],
  },
];
