// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { installNoAutoKeyboard, opensKeyboard, tapWasOnField } from './noAutoKeyboard';

let uninstall: () => void = () => {};

function withPointer(coarse: boolean) {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (q: string) => ({ matches: q.includes('coarse') ? coarse : false }) as MediaQueryList,
  );
}

function dialogWithInput() {
  document.body.innerHTML =
    '<div role="dialog" tabindex="-1" id="dlg"><label id="lbl">Name <input id="name" /></label><button id="btn">Save</button></div>';
  return {
    dialog: document.getElementById('dlg') as HTMLElement,
    input: document.getElementById('name') as HTMLInputElement,
    label: document.getElementById('lbl') as HTMLElement,
  };
}

afterEach(() => {
  uninstall();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('noAutoKeyboard on a touch device', () => {
  it('does not let a dialog auto-focus its first field', () => {
    withPointer(true);
    uninstall = installNoAutoKeyboard();
    const { dialog, input } = dialogWithInput();
    input.focus(); // what Radix / autoFocus do on open
    expect(document.activeElement).toBe(dialog);
  });

  it('lets the field focus when the user taps it', () => {
    withPointer(true);
    uninstall = installNoAutoKeyboard();
    const { input } = dialogWithInput();
    input.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    input.focus();
    expect(document.activeElement).toBe(input);
  });

  it('lets the field focus when the user taps its label', () => {
    withPointer(true);
    uninstall = installNoAutoKeyboard();
    const { input, label } = dialogWithInput();
    label.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    input.focus();
    expect(document.activeElement).toBe(input);
  });

  it('still blocks focus when the tap was on some other button', () => {
    withPointer(true);
    uninstall = installNoAutoKeyboard();
    const { dialog, input } = dialogWithInput();
    document.getElementById('btn')!.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    input.focus();
    expect(document.activeElement).toBe(dialog);
  });

  it("allows moving to the next field with the keyboard's Next key", () => {
    withPointer(true);
    uninstall = installNoAutoKeyboard();
    document.body.innerHTML = '<div role="dialog" tabindex="-1"><input id="a" /><input id="b" /></div>';
    const a = document.getElementById('a') as HTMLInputElement;
    const b = document.getElementById('b') as HTMLInputElement;
    a.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    a.focus();
    b.focus(); // Next key: no tap, focus moves field to field
    expect(document.activeElement).toBe(b);
  });

  it('allows keyboard Tab navigation', () => {
    withPointer(true);
    uninstall = installNoAutoKeyboard();
    const { input } = dialogWithInput();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }));
    input.focus();
    expect(document.activeElement).toBe(input);
  });
});

describe('noAutoKeyboard on desktop', () => {
  it('leaves auto-focus alone', () => {
    withPointer(false);
    uninstall = installNoAutoKeyboard();
    const { input } = dialogWithInput();
    input.focus();
    expect(document.activeElement).toBe(input);
  });
});

describe('opensKeyboard / tapWasOnField', () => {
  it('only treats typing fields as keyboard openers', () => {
    const make = (html: string) => {
      document.body.innerHTML = html;
      return document.body.firstElementChild;
    };
    expect(opensKeyboard(make('<input type="text" />'))).toBe(true);
    expect(opensKeyboard(make('<input />'))).toBe(true);
    expect(opensKeyboard(make('<textarea></textarea>'))).toBe(true);
    expect(opensKeyboard(make('<input type="checkbox" />'))).toBe(false);
    expect(opensKeyboard(make('<input type="date" />'))).toBe(false);
    expect(opensKeyboard(make('<input readonly />'))).toBe(false);
    expect(opensKeyboard(make('<button>x</button>'))).toBe(false);
  });

  it('recognises a tap on the field itself', () => {
    const { input } = dialogWithInput();
    expect(tapWasOnField(input, input)).toBe(true);
    expect(tapWasOnField(document.getElementById('btn'), input)).toBe(false);
  });
});
