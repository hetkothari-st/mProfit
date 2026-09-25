/**
 * On touch devices, focusing a text field opens the on-screen keyboard, which
 * covers half the screen. Dialogs auto-focus their first field on open (Radix
 * does it by default, and many forms add `autoFocus`), so every "Add …" dialog
 * opened with the keyboard already up and the first field taken.
 *
 * This guard lets a text field take focus on a touch device only when the user
 * asked for it: they tapped that field (or its label), or pressed Tab on a
 * hardware keyboard, or focus moved from one text field to the next (the
 * keyboard's Next key, or iOS's up/down arrows). Any other focus — auto-focus on open, `autoFocus`,
 * `el.focus()` from code — is undone, and focus moves to the surrounding
 * dialog instead so focus trapping and Escape keep working.
 *
 * Desktop (fine pointer) is untouched: auto-focus there saves a click and
 * opens no keyboard.
 */

const TEXT_INPUT_TYPES = new Set([
  '', 'text', 'email', 'number', 'password', 'search', 'tel', 'url',
]);

export function opensKeyboard(el: Element | null): el is HTMLElement {
  if (!el || !(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  if (el instanceof HTMLTextAreaElement) return !el.readOnly && !el.disabled;
  if (el instanceof HTMLInputElement) {
    return TEXT_INPUT_TYPES.has((el.getAttribute('type') ?? '').toLowerCase()) && !el.readOnly && !el.disabled;
  }
  return false;
}

/** Did this tap target the field — directly, inside it, or via its label? */
export function tapWasOnField(tapTarget: EventTarget | null, field: HTMLElement): boolean {
  if (!(tapTarget instanceof Node)) return false;
  if (field === tapTarget || field.contains(tapTarget)) return true;
  const label = tapTarget instanceof Element ? tapTarget.closest('label') : tapTarget.parentElement?.closest('label');
  return Boolean(label && (label.control === field || label.contains(field)));
}

const GESTURE_WINDOW_MS = 1500;

export function installNoAutoKeyboard(win: Window = window): () => void {
  const touchOnly =
    typeof win.matchMedia === 'function' && win.matchMedia('(pointer: coarse)').matches;
  if (!touchOnly) return () => {};

  const doc = win.document;
  let lastTap: { target: EventTarget | null; at: number } = { target: null, at: 0 };
  let lastTabKeyAt = 0;

  const onPointerDown = (e: Event) => {
    lastTap = { target: e.target, at: Date.now() };
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Tab') lastTabKeyAt = Date.now();
  };
  const onFocusIn = (e: FocusEvent) => {
    const field = e.target as Element | null;
    if (!opensKeyboard(field)) return;
    const now = Date.now();
    const userTapped = now - lastTap.at < GESTURE_WINDOW_MS && tapWasOnField(lastTap.target, field);
    const userTabbed = now - lastTabKeyAt < GESTURE_WINDOW_MS;
    // Keyboard already open on the previous field: Next / Go / iOS arrows.
    const fromTextField = opensKeyboard(e.relatedTarget as Element | null);
    if (userTapped || userTabbed || fromTextField) return;

    // Programmatic focus: hand it to the dialog (or nothing) instead.
    const container = field.closest<HTMLElement>('[role="dialog"], [role="alertdialog"]');
    if (container) {
      if (!container.hasAttribute('tabindex')) container.setAttribute('tabindex', '-1');
      container.focus({ preventScroll: true });
    } else {
      field.blur();
    }
  };

  doc.addEventListener('pointerdown', onPointerDown, true);
  doc.addEventListener('keydown', onKeyDown, true);
  doc.addEventListener('focusin', onFocusIn, true);
  return () => {
    doc.removeEventListener('pointerdown', onPointerDown, true);
    doc.removeEventListener('keydown', onKeyDown, true);
    doc.removeEventListener('focusin', onFocusIn, true);
  };
}
