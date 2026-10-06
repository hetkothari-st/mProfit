// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { startsInSidewaysControl, swipeDirection } from './useSwipeGesture';

const at = (x: number, y: number, t = 0) => ({ x, y, t });

describe('swipeDirection', () => {
  it('reads a clear right or left swipe', () => {
    expect(swipeDirection(at(20, 300), at(160, 310, 200))).toBe('right');
    expect(swipeDirection(at(250, 300), at(100, 290, 200))).toBe('left');
  });

  it('ignores short, diagonal and slow movements', () => {
    expect(swipeDirection(at(20, 300), at(70, 300, 100))).toBeNull(); // too short
    expect(swipeDirection(at(20, 300), at(140, 420, 200))).toBeNull(); // mostly a scroll
    expect(swipeDirection(at(20, 300), at(200, 300, 1500))).toBeNull(); // a slow drag
  });
});

describe('startsInSidewaysControl', () => {
  it('skips inputs and opted-out regions', () => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    expect(startsInSidewaysControl(input)).toBe(true);

    const box = document.createElement('div');
    box.dataset.noSwipe = '';
    const child = document.createElement('span');
    box.appendChild(child);
    document.body.appendChild(box);
    expect(startsInSidewaysControl(child)).toBe(true);
  });

  it('skips a horizontally scrolling container', () => {
    const scroller = document.createElement('div');
    scroller.style.overflowX = 'auto';
    Object.defineProperty(scroller, 'scrollWidth', { value: 900 });
    Object.defineProperty(scroller, 'clientWidth', { value: 360 });
    const cell = document.createElement('td');
    scroller.appendChild(cell);
    document.body.appendChild(scroller);
    expect(startsInSidewaysControl(cell)).toBe(true);
  });

  it('allows ordinary page content', () => {
    const p = document.createElement('p');
    document.body.appendChild(p);
    expect(startsInSidewaysControl(p)).toBe(false);
  });
});
