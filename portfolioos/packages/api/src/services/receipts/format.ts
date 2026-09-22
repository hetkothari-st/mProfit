/**
 * `Rs.` with Indian digit grouping, for an amount already fixed to 2dp.
 *
 * `Rs.` rather than `₹` because PDFKit's built-in Helvetica has no U+20B9
 * glyph and would draw a blank box; the statement sentence and the PDF share
 * this so the figure reads the same in both places.
 */
export function inr(amount: string): string {
  const [whole = '0', frac = '00'] = amount.split('.');
  const negative = whole.startsWith('-');
  const digits = whole.replace('-', '');
  const head = digits.length > 3 ? digits.slice(0, digits.length - 3) : '';
  const tail = digits.slice(-3);
  const grouped = head ? `${head.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${tail}` : tail;
  return `${negative ? '-' : ''}Rs. ${grouped}.${frac.padEnd(2, '0').slice(0, 2)}`;
}
