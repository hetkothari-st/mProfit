import * as React from 'react';
import { useScrollFade } from '@/hooks/useScrollFade';

type HScrollProps = React.HTMLAttributes<HTMLElement> & { as?: 'div' | 'nav' };

/**
 * A horizontal scroller that fades whichever edge hides content, so on a phone
 * it's clear the row/table continues sideways. Bring your own overflow-x-auto.
 */
export function HScroll({ as: Tag = 'div', children, ...rest }: HScrollProps) {
  const ref = React.useRef<HTMLElement>(null);
  useScrollFade(ref);
  return React.createElement(Tag, { ref, ...rest }, children);
}
