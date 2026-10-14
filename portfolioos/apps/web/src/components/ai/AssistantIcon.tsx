import type { SVGProps } from 'react';

/**
 * AI assistant mark: a friendly robot head inside a speech bubble.
 * Drawn on a 24px grid with `currentColor` strokes so it inherits the
 * surrounding text colour and works in light, dark and accent contexts,
 * and takes `strokeWidth` like a lucide icon so call sites stay uniform.
 */
export function AssistantIcon({ strokeWidth = 1.9, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {/* Head + antenna + speech-bubble tail */}
      <path d="M12.4 2.5V4.8H16a4.4 4.4 0 0 1 4.4 4.4v5A4.4 4.4 0 0 1 16 18.6L13 21.6V18.6H8a4.4 4.4 0 0 1-4.4-4.4v-5A4.4 4.4 0 0 1 8 4.8h2.8" />
      {/* Ears */}
      <path d="M3.6 10.6H3a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1h.6" />
      <path d="M20.4 10.6H21a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1h-.6" />
      {/* Face plate */}
      <rect x="5.9" y="8.6" width="12.2" height="7.2" rx="2.4" />
      {/* Eyes + smile */}
      <circle cx="9" cy="12.2" r="0.55" fill="currentColor" stroke="none" />
      <circle cx="15" cy="12.2" r="0.55" fill="currentColor" stroke="none" />
      <path d="M10.5 13.3h3a1.5 1.5 0 0 1-3 0z" fill="currentColor" strokeWidth={0.6} />
    </svg>
  );
}
