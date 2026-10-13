/**
 * "Forty-five thousand only" — the line that makes a receipt a receipt.
 *
 * Indian numbering, because the artefact is Indian: after a thousand the
 * groups are lakh and crore, not million and billion. A receipt that says
 * "four hundred fifty thousand" would be understood but is not what anyone
 * here writes on one.
 *
 * Paise are spelled separately rather than as a decimal, the way a cheque
 * does, and dropped entirely when they are zero — "and zero paise" reads as a
 * machine wrote it.
 */

const ONES = [
  '',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
];

const TENS = [
  '',
  '',
  'twenty',
  'thirty',
  'forty',
  'fifty',
  'sixty',
  'seventy',
  'eighty',
  'ninety',
];

/** 0–99. */
function twoDigits(n: number): string {
  if (n < 20) return ONES[n]!;
  const tens = TENS[Math.floor(n / 10)]!;
  const ones = ONES[n % 10]!;
  return ones ? `${tens}-${ones}` : tens;
}

/** 0–999. */
function threeDigits(n: number): string {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  const parts: string[] = [];
  if (hundreds) parts.push(`${ONES[hundreds]} hundred`);
  if (rest) parts.push(twoDigits(rest));
  return parts.join(' ');
}

/** A whole rupee count in Indian groups. */
function indianGroups(n: number): string {
  if (n === 0) return 'zero';

  const crore = Math.floor(n / 10_000_000);
  const lakh = Math.floor((n % 10_000_000) / 100_000);
  const thousand = Math.floor((n % 100_000) / 1000);
  const rest = n % 1000;

  const parts: string[] = [];
  // A crore count can itself exceed 99, so it recurses rather than assuming
  // three digits: 1,23,45,67,89,012 is a number a portfolio can reach.
  if (crore) parts.push(`${crore > 999 ? indianGroups(crore) : threeDigits(crore)} crore`);
  if (lakh) parts.push(`${threeDigits(lakh)} lakh`);
  if (thousand) parts.push(`${threeDigits(thousand)} thousand`);
  if (rest) parts.push(threeDigits(rest));
  return parts.join(' ');
}

/**
 * The spelled-out amount, capitalised, ending in "only" — the convention on
 * every receipt and cheque this will sit beside.
 *
 * Takes a decimal string rather than a number so it can be handed a
 * `Prisma.Decimal` straight from the ledger with no float rounding on the way.
 */
export function amountInWords(amount: string | number): string {
  const raw = typeof amount === 'number' ? amount.toFixed(2) : amount.trim();
  const negative = raw.startsWith('-');
  const [wholeStr = '0', fracStr = ''] = raw.replace(/^-/, '').split('.');

  // Digits only, parsed as an integer: this is a count of rupees to be spelled
  // out, not an amount to compute with, and the Decimal it came from is still
  // the number of record.
  const whole = Number.parseInt(wholeStr.replace(/\D/g, ''), 10) || 0;
  // Two digits, rounding away anything finer: the ledger stores four decimals
  // and a receipt cannot be written for a tenth of a paisa.
  const paise = Math.round(Number.parseFloat(`0.${fracStr || '0'}`) * 100);

  // Rounding the paise can carry into the rupees (0.999 → 100 paise).
  const carried = paise === 100 ? whole + 1 : whole;
  const finalPaise = paise === 100 ? 0 : paise;

  const words = finalPaise
    ? `${indianGroups(carried)} rupees and ${twoDigits(finalPaise)} paise`
    : `${indianGroups(carried)} rupees`;

  const sentence = `${negative && (carried || finalPaise) ? 'minus ' : ''}${words} only`;
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}
