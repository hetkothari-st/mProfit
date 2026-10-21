import type { KnowledgeEntry, KnowledgeSource } from '../library.js';

const SRC: KnowledgeSource = {
  kind: 'NISM',
  series: 'X-B',
  edition: '2025-12',
  chapter: 14,
  chapterTitle: 'Basics of Estate Planning',
};

export const XB_14: readonly KnowledgeEntry[] = [
  {
    id: 'xb-14-why-estate-planning',
    title: 'What estate planning is and who needs it',
    principle:
      'Estate planning covers how wealth is accumulated, conserved and passed on, and who manages your affairs if you cannot. It is not only for the rich: anyone who wants particular people to receive particular assets needs it, especially families with minor or special-needs children, people with large debts, property in several states, small-business owners, and anyone worried about disability. Goals: preserve assets for loved ones, name guardians for minors, plan for incapacity (finances and health decisions), ensure debts can be paid, give specific assets to specific people, provide for special-needs children, and make collection and distribution efficient with minimal disputes. It differs from business succession planning, which hands a business to the next generation during one’s lifetime; everyone needs an estate plan whether or not they have a business.',
    source: SRC,
    topics: ['estate', 'planning'],
    keywords: ['estate planning', 'why make a will', 'succession planning', 'estate plan for minors', 'special needs child planning', 'incapacity planning'],
  },
  {
    id: 'xb-14-estate-constituents-intestacy',
    title: 'What makes up an estate, and dying without a will',
    principle:
      'An estate is everything a person owns or controls, in any form of ownership, plus money arising on death such as life insurance. It can be viewed as the gross estate (property, bank accounts, investments, business interests, NPS, insurance), the residue (personal effects such as car, jewellery and furniture, plus anything the will or a trust does not cover) and estate debts (loans, card dues, taxes, legal liabilities). A person dies intestate for any property not effectively left by will (wholly or partly). Then personal law decides: the Hindu Succession Act 1956 for Hindus, Buddhists, Jains and Sikhs; the Indian Succession Act 1925 for Christians, Parsis and Jews; Muslim personal law (differing for Shias and Sunnis) for Muslims. Heirs of someone who died intestate apply to a civil court for a succession certificate.',
    source: SRC,
    topics: ['estate'],
    keywords: ['estate constituents', 'gross estate', 'residue estate', 'die without will', 'intestate', 'succession certificate', 'which law applies inheritance'],
  },
  {
    id: 'xb-14-estate-plan-elements',
    title: 'Elements of an estate plan',
    principle:
      'At minimum a will and a living will. The will says who inherits what and names guardians and the arrangements for minors or dependants with special needs. Trusts hold assets for beneficiaries on the settlor’s terms; a testamentary trust created by will goes through probate with the will. A power of attorney lets someone manage finances if one is incapacitated or away (common for NRIs). A living will (advance directive) records end-of-life medical wishes for when one cannot communicate. Nominations complete the plan: nominees usually only hold assets until they pass to the legal heirs, except beneficial nominees of life policies (parents, spouse, children) who keep the money. Review nominations after events like marriage.',
    source: SRC,
    topics: ['estate'],
    keywords: ['elements of estate plan', 'will', 'living will', 'advance directive', 'testamentary trust', 'power of attorney', 'nominee vs legal heir'],
  },
  {
    id: 'xb-14-succession-laws-by-religion',
    title: 'Which succession law applies',
    principle:
      'The Indian Succession Act 1925 governs wills (testamentary succession) for Hindus, Buddhists, Jains, Sikhs, Christians and others, and also intestate succession for Christians (and Parsis, Jews). Intestate succession for Hindus, Buddhists, Jains and Sikhs follows the Hindu Succession Act 1956 (amended 2005). For Muslims neither applies: succession, with or without a will, follows Muslim personal law (the Shariat Application Act 1937 for intestate succession), except that wills over immovable property in West Bengal or within the Bombay or Madras High Courts’ jurisdiction follow the Indian Succession Act.',
    source: SRC,
    topics: ['estate', 'regulation'],
    keywords: ['Indian Succession Act 1925', 'Hindu Succession Act 1956', 'Muslim succession law', 'Christian inheritance law', 'testamentary vs intestate'],
  },
  {
    id: 'xb-14-hindu-male-intestate',
    title: 'Hindu Succession Act: a Hindu man dying without a will',
    principle:
      'Property passes first to Class I heirs together: sons, daughters, widow(s), mother, and the children and widows of predeceased children down the lines listed in the schedule (adopted children count; children of void marriages count; the father is not Class I). Shares: all widows together take one share; each surviving son, daughter and the mother take one share each; each predeceased child’s branch takes one share, split equally within it (a predeceased son’s widow and children taking equal parts). Only if there is no Class I heir does Class II inherit, entry by entry (father first; then son’s daughter’s children, brothers and sisters; then further entries such as nephews, grandparents, uncles and aunts), sharing equally within an entry; then agnates, then cognates.',
    inPractice:
      'Agnates are related wholly through males, cognates otherwise; among them fewer degrees of ascent win, then fewer degrees of descent. Uterine siblings (same mother, different father) are excluded from Class I and II.',
    source: SRC,
    topics: ['estate'],
    keywords: ['Class I heirs', 'Class II heirs', 'Hindu succession male', 'who inherits if no will Hindu', 'widow share', 'mother share', 'agnates cognates'],
  },
  {
    id: 'xb-14-hindu-female-intestate',
    title: 'Hindu Succession Act: a Hindu woman dying without a will',
    principle:
      'Since 1956 a Hindu woman holds all her property as full owner (section 14), not as a limited owner. If she dies intestate it passes, in order: first to her sons and daughters (including children of predeceased children) and husband; then to her husband’s heirs; then to her mother and father; then to her father’s heirs; finally to her mother’s heirs. Example from the workbook: an unmarried Hindu man with no Class I heirs, whose father has also died, leaves his estate equally to his brother and two sisters (the same Class II entry).',
    source: SRC,
    topics: ['estate'],
    keywords: ['Hindu female succession', 'woman property inheritance', 'section 14 absolute owner', 'section 15', 'who inherits woman property'],
  },
  {
    id: 'xb-14-muslim-succession',
    title: 'Muslim succession and wills (wasiyat)',
    principle:
      'Based on the Quran, Sunna, Ijma and Qiyas. Heirs are sharers with fixed fractions (twelve classes, including husband, wife, daughter, son’s daughter, father, paternal grandfather, mother, grandmother, and full, consanguine and uterine sisters and uterine brother) and residuaries who take what is left. A widow takes a quarter if there are no children or grandchildren, an eighth otherwise; a husband half or a quarter; a sole daughter half, two or more daughters two-thirds together; with sons, daughters become residuaries taking half a son’s share. Sunnis distribute per capita, Shias per stirpes. A Muslim over 15 of sound mind may bequeath at most one-third of the net estate by will (oral, written or by gesture, revocable any time).',
    inPractice:
      'There is no birthright or ancestral-property distinction, heirs must survive the deceased, a child in the womb inherits only if born alive, and with no heir the state takes by escheat.',
    source: SRC,
    topics: ['estate'],
    keywords: ['Muslim inheritance', 'Muslim will one third', 'wasiyat', 'sharers residuaries', 'Muslim widow share', 'Shia Sunni inheritance'],
  },
  {
    id: 'xb-14-mwpa-mutation',
    title: 'Married Women’s Property Act and mutation of property',
    principle:
      'The MWP Act 1874 makes a married woman’s earnings, savings and investments (and property from her skills) her separate property, lets her take insurance in her own right and sue in her own name, makes her liable for her own pre-marriage debts (not her husband), and makes a husband’s life policy expressed for the benefit of his wife and children a trust beyond his and his creditors’ reach. Mutation is the state-run change of the owner’s name in land revenue records, mainly so property tax can be collected; it requires clearing dues and documents, and it is not proof of title, which comes from title documents.',
    source: SRC,
    topics: ['estate', 'real-estate'],
    keywords: ['Married Women’s Property Act', 'wife separate property', 'MWP policy trust', 'mutation of property', 'property name change after death', 'mutation not title'],
  },
];
