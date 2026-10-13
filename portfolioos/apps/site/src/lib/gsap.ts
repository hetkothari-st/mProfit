import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useEffect, useLayoutEffect } from 'react';

if (typeof window !== 'undefined') gsap.registerPlugin(ScrollTrigger);

export { gsap, ScrollTrigger };

/** useLayoutEffect in the browser, useEffect during prerender (avoids the SSR warning). */
export const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
