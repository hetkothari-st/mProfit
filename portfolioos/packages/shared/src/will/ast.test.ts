import { describe, it, expect } from 'vitest';
import { renderWillText, type WillBlock } from './ast.js';

describe('renderWillText', () => {
  it('renders every block kind deterministically', () => {
    const blocks: WillBlock[] = [
      { t: 'title', text: 'Last Will and Testament' },
      { t: 'heading', text: 'of A B' },
      { t: 'clause', n: 1, title: 'Declaration', paras: ['First.', 'Second.  '] },
      { t: 'table', title: 'Gifts', rows: [['Car', 'Son']] },
      { t: 'table', title: null, rows: [['House', 'Wife - 50%']] },
      { t: 'para', text: 'Signed.' },
      { t: 'signature', lines: ['Place: ____', 'Date: ____'] },
      { t: 'witnesses', intro: 'Witnessed by:', count: 2, fields: ['Name'] },
      { t: 'note', text: 'Note.' },
    ];
    expect(renderWillText(blocks)).toBe(
      [
        'LAST WILL AND TESTAMENT',
        'of A B',
        '1. Declaration\nFirst.\nSecond.',
        'Gifts\n- Car: Son',
        '- House: Wife - 50%',
        'Signed.',
        'Place: ____\nDate: ____',
        'Witnessed by:\nWitness 1\nName: ____________________\nWitness 2\nName: ____________________',
        'Note.',
      ].join('\n\n') + '\n',
    );
  });
});
