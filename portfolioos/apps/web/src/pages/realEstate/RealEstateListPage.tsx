import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  Home,
  Plus,
  ArrowUpRight,
  MapPin,
  Pencil,
  Trash2,
  Loader2,
  TrendingUp,
  TrendingDown,
  Building2,
  Castle,
  Map as MapIcon,
  Briefcase,
  Store,
  Sprout,
  Car,
  Construction,
  Building,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  Decimal,
  formatINR,
  totalCostBasisOf,
  PROPERTY_TYPE_LABELS,
  PROPERTY_STATUS_LABELS,
} from '@portfolioos/shared';
import type { OwnedPropertyDTO, PropertyType } from '@portfolioos/shared';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/common/EmptyState';
import { realEstateApi } from '@/api/realEstate.api';
import { apiErrorMessage } from '@/api/client';
import { PropertyFormDialog } from './PropertyFormDialog';

// ── Per-type identity: icon (used in nameplate strip) ────────────────

const TYPE_ICON: Record<PropertyType, LucideIcon> = {
  APARTMENT: Building2,
  INDEPENDENT_HOUSE: Home,
  VILLA: Castle,
  PLOT_LAND: MapIcon,
  COMMERCIAL_OFFICE: Briefcase,
  COMMERCIAL_SHOP: Store,
  AGRICULTURAL: Sprout,
  PARKING_GARAGE: Car,
  UNDER_CONSTRUCTION: Construction,
  OTHER: Building,
};

// ── Property scene — composed atmospheric SVG illustrations ──────────
// Each property type renders as a small magazine-style vignette. Two
// palettes (day / night) keyed off CSS dark-mode media query so the
// scene reads cleanly on both parchment and gunmetal surfaces.

interface SceneProps { type: PropertyType }

const SVG_DEFS = (
  <defs>
    {/* Day sky — warm parchment dawn */}
    <linearGradient id="re-sky-day" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stopColor="hsl(36 65% 86%)" />
      <stop offset="60%"  stopColor="hsl(36 50% 92%)" />
      <stop offset="100%" stopColor="hsl(38 35% 95%)" />
    </linearGradient>
    {/* Night sky — gunmetal dusk */}
    <linearGradient id="re-sky-night" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stopColor="hsl(217 28% 13%)" />
      <stop offset="60%"  stopColor="hsl(217 22% 17%)" />
      <stop offset="100%" stopColor="hsl(217 18% 21%)" />
    </linearGradient>
    {/* Office night sky — cooler */}
    <linearGradient id="re-sky-office" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stopColor="hsl(213 35% 11%)" />
      <stop offset="100%" stopColor="hsl(213 25% 22%)" />
    </linearGradient>
    {/* Cool slate sky — parking */}
    <linearGradient id="re-sky-slate" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stopColor="hsl(215 14% 26%)" />
      <stop offset="100%" stopColor="hsl(215 10% 36%)" />
    </linearGradient>
  </defs>
);

function PropertyScene({ type }: SceneProps) {
  // Use theme vars for ink/accent — same in both modes.
  const accent = 'hsl(var(--accent))';
  const ink = 'hsl(var(--primary))';

  // Common SVG props.
  const common = {
    width: '100%',
    height: '100%',
    viewBox: '0 0 320 128',
    preserveAspectRatio: 'xMidYMid slice',
    'aria-hidden': true,
  } as const;

  switch (type) {
    case 'APARTMENT': {
      // Urban dusk skyline — three stacked apartment buildings, scattered lit
      // windows, moon at top-right.
      const lit = 'hsl(36 80% 70%)';
      return (
        <svg {...common}>
          {SVG_DEFS}
          <rect width="320" height="128" className="fill-[url(#re-sky-day)] dark:fill-[url(#re-sky-night)]" />
          {/* Distant skyline silhouette */}
          <g fill={ink} opacity="0.18">
            <path d="M0 96 L28 96 L28 76 L46 76 L46 96 L72 96 L72 80 L92 80 L92 96 L120 96 L120 70 L140 70 L140 96 L320 96 L320 128 L0 128 Z" />
          </g>
          {/* Foreground triple-tower apartment block */}
          <g fill={ink} opacity="0.85">
            <rect x="40" y="44" width="50" height="76" />
            <rect x="92" y="28" width="56" height="92" />
            <rect x="150" y="52" width="48" height="68" />
            <rect x="200" y="64" width="42" height="56" />
            <rect x="244" y="40" width="50" height="80" />
          </g>
          {/* Window grid */}
          <g fill={lit}>
            {[0, 1, 2].map((c) =>
              [0, 1, 2, 3].map((r) => (
                <rect key={`a-${c}-${r}`} x={48 + c * 12} y={52 + r * 14} width="6" height="8" opacity={r === 1 || r === 3 ? 0.85 : 0.25} />
              )),
            )}
            {[0, 1, 2, 3].map((c) =>
              [0, 1, 2, 3, 4, 5].map((r) => (
                <rect key={`b-${c}-${r}`} x={100 + c * 12} y={36 + r * 13} width="6" height="8" opacity={(c + r) % 2 === 0 ? 0.85 : 0.2} />
              )),
            )}
            {[0, 1, 2].map((c) =>
              [0, 1, 2, 3].map((r) => (
                <rect key={`c-${c}-${r}`} x={156 + c * 12} y={60 + r * 12} width="6" height="7" opacity={r === 0 || c === 1 ? 0.85 : 0.2} />
              )),
            )}
            {[0, 1, 2].map((c) =>
              [0, 1, 2, 3, 4].map((r) => (
                <rect key={`e-${c}-${r}`} x={252 + c * 12} y={48 + r * 13} width="6" height="8" opacity={(c * 3 + r) % 3 === 0 ? 0.85 : 0.22} />
              )),
            )}
          </g>
          {/* Moon */}
          <circle cx="278" cy="28" r="9" fill={accent} opacity="0.85" />
          <circle cx="282" cy="26" r="9" fill="hsl(var(--card))" />
        </svg>
      );
    }

    case 'INDEPENDENT_HOUSE': {
      // Country home at sunset — gabled house, tree, sun, path.
      return (
        <svg {...common}>
          {SVG_DEFS}
          <rect width="320" height="128" className="fill-[url(#re-sky-day)] dark:fill-[url(#re-sky-night)]" />
          {/* Sun behind house */}
          <circle cx="200" cy="62" r="22" fill={accent} opacity="0.55" />
          <circle cx="200" cy="62" r="14" fill={accent} opacity="0.85" />
          {/* Distant hill */}
          <path d="M0 96 Q90 80 200 92 T320 88 L320 128 L0 128 Z" fill={ink} opacity="0.15" />
          {/* Tree */}
          <g fill={ink} opacity="0.85">
            <rect x="58" y="84" width="4" height="22" />
            <circle cx="60" cy="78" r="14" />
            <circle cx="50" cy="84" r="10" />
            <circle cx="70" cy="82" r="11" />
          </g>
          {/* House */}
          <g fill={ink} opacity="0.9">
            <path d="M120 96 L120 68 L160 48 L200 68 L200 96 Z" />
            <rect x="158" y="76" width="14" height="20" fill="hsl(36 70% 60%)" />
            <rect x="130" y="76" width="14" height="12" fill="hsl(36 70% 70%)" opacity="0.8" />
            <rect x="178" y="76" width="14" height="12" fill="hsl(36 70% 70%)" opacity="0.8" />
            {/* Chimney */}
            <rect x="186" y="42" width="8" height="14" />
          </g>
          {/* Picket fence row */}
          <g stroke={ink} strokeWidth="1.1" opacity="0.55">
            {Array.from({ length: 24 }).map((_, i) => (
              <line key={i} x1={6 + i * 13} y1="100" x2={6 + i * 13} y2="116" />
            ))}
            <line x1="0" y1="106" x2="320" y2="106" />
          </g>
          {/* Path */}
          <path d="M165 96 Q165 110 175 122" stroke={accent} strokeWidth="2" fill="none" opacity="0.5" strokeDasharray="3 3" />
        </svg>
      );
    }

    case 'VILLA': {
      // Luxury seaside silhouette — colonnade with dome + palm tree + horizon line.
      return (
        <svg {...common}>
          {SVG_DEFS}
          <rect width="320" height="128" className="fill-[url(#re-sky-day)] dark:fill-[url(#re-sky-night)]" />
          {/* Sun */}
          <circle cx="248" cy="46" r="18" fill={accent} opacity="0.7" />
          {/* Sea horizon */}
          <rect x="0" y="98" width="320" height="6" fill={accent} opacity="0.3" />
          <path d="M0 100 Q40 96 80 100 T160 100 T240 100 T320 100" stroke={accent} strokeWidth="0.8" fill="none" opacity="0.55" />
          {/* Palm tree */}
          <g fill={ink} opacity="0.88">
            <path d="M60 110 Q58 80 56 60" stroke={ink} strokeWidth="3" fill="none" />
            <path d="M56 60 Q40 52 28 60" stroke={ink} strokeWidth="2.5" fill="none" />
            <path d="M56 60 Q72 50 86 58" stroke={ink} strokeWidth="2.5" fill="none" />
            <path d="M56 60 Q48 44 38 40" stroke={ink} strokeWidth="2.5" fill="none" />
            <path d="M56 60 Q66 44 78 42" stroke={ink} strokeWidth="2.5" fill="none" />
            <circle cx="62" cy="60" r="3" />
          </g>
          {/* Villa with dome + colonnade */}
          <g fill={ink} opacity="0.9">
            {/* Base */}
            <rect x="120" y="80" width="160" height="22" />
            {/* Columns */}
            {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
              <rect key={i} x={130 + i * 20} y="58" width="6" height="22" />
            ))}
            {/* Architrave */}
            <rect x="118" y="52" width="164" height="8" />
            {/* Pediment */}
            <path d="M118 52 L200 30 L282 52 Z" />
            {/* Dome */}
            <path d="M180 30 Q200 6 220 30 Z" />
            <rect x="198" y="14" width="4" height="6" />
          </g>
          {/* Foreground sand line */}
          <rect x="0" y="120" width="320" height="8" fill={ink} opacity="0.18" />
        </svg>
      );
    }

    case 'PLOT_LAND': {
      // Surveyor's plat — measured rectangle with corner stakes, compass rose,
      // dotted boundary, contour lines underneath.
      return (
        <svg {...common}>
          {SVG_DEFS}
          <rect width="320" height="128" className="fill-[url(#re-sky-day)] dark:fill-[url(#re-sky-night)]" />
          {/* Distant terrain */}
          <g stroke={ink} strokeWidth="1" opacity="0.3" fill="none">
            <path d="M0 88 Q80 78 160 84 T320 76" />
            <path d="M0 96 Q80 86 160 92 T320 84" />
            <path d="M0 104 Q80 94 160 100 T320 92" />
          </g>
          {/* Plot boundary */}
          <g stroke={accent} strokeWidth="1.6" fill="none" strokeDasharray="6 4">
            <path d="M70 30 L240 26 L255 96 L60 100 Z" />
          </g>
          {/* Diagonal lot lines */}
          <g stroke={ink} strokeWidth="0.6" opacity="0.35" strokeDasharray="2 3">
            <line x1="70" y1="30" x2="255" y2="96" />
            <line x1="240" y1="26" x2="60" y2="100" />
          </g>
          {/* Corner stakes */}
          <g fill={ink}>
            {[[70, 30], [240, 26], [255, 96], [60, 100]].map(([x, y], i) => (
              <g key={i}>
                <circle cx={x} cy={y} r="3" />
                <circle cx={x} cy={y} r="1.5" fill={accent} />
              </g>
            ))}
          </g>
          {/* Compass rose top-right */}
          <g transform="translate(280, 26)">
            <circle r="14" fill="none" stroke={ink} strokeWidth="0.8" opacity="0.5" />
            <path d="M0 -14 L3 0 L0 14 L-3 0 Z" fill={ink} opacity="0.85" />
            <path d="M-14 0 L0 -3 L14 0 L0 3 Z" fill={ink} opacity="0.4" />
            <text y="-16" textAnchor="middle" fill={ink} opacity="0.85" fontSize="7" fontFamily="JetBrains Mono, monospace" fontWeight="600">N</text>
          </g>
          {/* Acreage tag */}
          <g transform="translate(150, 60)">
            <rect x="-26" y="-10" width="52" height="20" fill="hsl(var(--card))" stroke={ink} strokeWidth="0.8" opacity="0.85" />
            <text y="2" textAnchor="middle" fill={ink} fontSize="9" fontFamily="JetBrains Mono, monospace" fontWeight="600">PLOT</text>
            <text y="11" textAnchor="middle" fill={accent} fontSize="6" fontFamily="JetBrains Mono, monospace">SURVEYED</text>
          </g>
        </svg>
      );
    }

    case 'COMMERCIAL_OFFICE': {
      // Corporate skyline at night — central tall tower with grid of lit
      // windows, neighbours stepping down. Beacon at the top.
      return (
        <svg {...common}>
          {SVG_DEFS}
          <rect width="320" height="128" className="fill-[hsl(213_28%_88%)] dark:fill-[url(#re-sky-office)]" />
          {/* Neighbour buildings */}
          <g fill={ink} opacity="0.75">
            <rect x="20" y="68" width="48" height="56" />
            <rect x="74" y="56" width="40" height="68" />
            <rect x="220" y="50" width="40" height="74" />
            <rect x="266" y="64" width="40" height="60" />
          </g>
          {/* Central tower */}
          <g fill={ink}>
            <rect x="124" y="20" width="84" height="104" />
          </g>
          {/* Lit window grid on tower */}
          <g fill="hsl(195 60% 78%)">
            {[0, 1, 2, 3, 4, 5].map((c) =>
              [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((r) => {
                const lit = (c * 5 + r * 3) % 7 < 4;
                return (
                  <rect
                    key={`t-${c}-${r}`}
                    x={130 + c * 13}
                    y={26 + r * 9}
                    width="8"
                    height="5"
                    opacity={lit ? 0.92 : 0.15}
                  />
                );
              }),
            )}
          </g>
          {/* Neighbour windows */}
          <g fill="hsl(195 60% 78%)">
            {[0, 1, 2].map((c) =>
              [0, 1, 2, 3].map((r) => (
                <rect key={`l-${c}-${r}`} x={28 + c * 14} y={74 + r * 11} width="8" height="5" opacity={(c + r) % 2 ? 0.85 : 0.2} />
              )),
            )}
            {[0, 1].map((c) =>
              [0, 1, 2, 3, 4].map((r) => (
                <rect key={`r-${c}-${r}`} x={228 + c * 16} y={56 + r * 12} width="10" height="5" opacity={(c * 2 + r) % 3 === 0 ? 0.85 : 0.2} />
              )),
            )}
          </g>
          {/* Antenna + beacon */}
          <line x1="166" y1="20" x2="166" y2="6" stroke={ink} strokeWidth="1.4" />
          <circle cx="166" cy="6" r="3" fill="hsl(0 70% 60%)" />
          <circle cx="166" cy="6" r="6" fill="hsl(0 70% 60%)" opacity="0.25" />
        </svg>
      );
    }

    case 'COMMERCIAL_SHOP': {
      // High street vignette — striped awning, hanging sign, lamp post.
      const awning1 = 'hsl(28 60% 50%)';
      const awning2 = 'hsl(40 22% 92%)';
      return (
        <svg {...common}>
          {SVG_DEFS}
          <rect width="320" height="128" className="fill-[url(#re-sky-day)] dark:fill-[url(#re-sky-night)]" />
          {/* Cobblestone band */}
          <rect x="0" y="116" width="320" height="12" fill={ink} opacity="0.18" />
          {/* Lamp post */}
          <g fill={ink} opacity="0.88">
            <rect x="40" y="40" width="3" height="76" />
            <circle cx="41.5" cy="38" r="6" fill={accent} />
            <path d="M30 32 L53 32 L48 24 L35 24 Z" opacity="0.7" />
          </g>
          <circle cx="41.5" cy="38" r="14" fill={accent} opacity="0.18" />
          {/* Shop facade */}
          <g>
            <rect x="80" y="56" width="180" height="60" fill={ink} opacity="0.2" />
            {/* Door */}
            <rect x="156" y="76" width="28" height="40" fill={ink} opacity="0.85" />
            <circle cx="178" cy="98" r="1.5" fill={accent} />
            {/* Window panels */}
            <rect x="86" y="76" width="62" height="40" fill="hsl(195 50% 70%)" opacity="0.55" />
            <rect x="192" y="76" width="62" height="40" fill="hsl(195 50% 70%)" opacity="0.55" />
            {/* Window mullions */}
            <line x1="118" y1="76" x2="118" y2="116" stroke={ink} strokeWidth="0.8" opacity="0.6" />
            <line x1="86" y1="92" x2="148" y2="92" stroke={ink} strokeWidth="0.8" opacity="0.6" />
            <line x1="224" y1="76" x2="224" y2="116" stroke={ink} strokeWidth="0.8" opacity="0.6" />
            <line x1="192" y1="92" x2="254" y2="92" stroke={ink} strokeWidth="0.8" opacity="0.6" />
          </g>
          {/* Awning — striped scallop */}
          <g>
            {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <path
                key={i}
                d={`M${80 + i * 20} 56 Q${90 + i * 20} 72 ${100 + i * 20} 56`}
                fill={i % 2 === 0 ? awning1 : awning2}
              />
            ))}
            <rect x="80" y="52" width="180" height="6" fill={awning1} />
          </g>
          {/* Hanging sign */}
          <g fill={ink} opacity="0.85">
            <line x1="276" y1="56" x2="276" y2="74" stroke={ink} strokeWidth="1.2" />
            <rect x="262" y="74" width="28" height="16" fill="hsl(var(--card))" stroke={accent} strokeWidth="1" />
          </g>
          <text x="276" y="86" textAnchor="middle" fill={ink} fontSize="8" fontFamily="Instrument Serif, serif" fontStyle="italic" opacity="0.85">shop</text>
        </svg>
      );
    }

    case 'AGRICULTURAL': {
      // Farmland — large sun, wheat fields, barn silhouette.
      return (
        <svg {...common}>
          {SVG_DEFS}
          <rect width="320" height="128" className="fill-[url(#re-sky-day)] dark:fill-[url(#re-sky-night)]" />
          {/* Big sun */}
          <circle cx="80" cy="42" r="22" fill={accent} opacity="0.55" />
          <circle cx="80" cy="42" r="14" fill={accent} opacity="0.9" />
          {/* Distant hills */}
          <path d="M0 84 Q80 70 160 80 T320 72 L320 128 L0 128 Z" fill={ink} opacity="0.18" />
          <path d="M0 96 Q80 84 160 92 T320 86 L320 128 L0 128 Z" fill={ink} opacity="0.25" />
          {/* Field rows */}
          <g stroke={accent} strokeWidth="1" opacity="0.65">
            <path d="M-10 110 Q80 102 170 110 T330 102" />
            <path d="M-10 116 Q80 108 170 116 T330 108" />
            <path d="M-10 122 Q80 114 170 122 T330 114" />
          </g>
          {/* Barn */}
          <g fill={ink} opacity="0.88">
            <path d="M210 96 L210 78 L240 60 L270 78 L270 96 Z" />
            <rect x="220" y="86" width="10" height="10" fill="hsl(36 70% 60%)" />
            <rect x="248" y="86" width="14" height="6" fill="hsl(36 70% 60%)" opacity="0.7" />
          </g>
          {/* Silo */}
          <g fill={ink} opacity="0.82">
            <rect x="276" y="64" width="14" height="32" />
            <path d="M276 64 Q283 58 290 64 Z" />
          </g>
          {/* Wheat stalks */}
          <g stroke={accent} strokeWidth="1.2" opacity="0.85">
            {[136, 146, 156, 166, 176].map((x, i) => (
              <g key={i} transform={`translate(${x}, 100)`}>
                <line x1="0" y1="0" x2="0" y2="-14" />
                <line x1="0" y1="-10" x2="-3" y2="-13" />
                <line x1="0" y1="-10" x2="3" y2="-13" />
                <line x1="0" y1="-6" x2="-3" y2="-9" />
                <line x1="0" y1="-6" x2="3" y2="-9" />
              </g>
            ))}
          </g>
        </svg>
      );
    }

    case 'PARKING_GARAGE': {
      // Multi-level concrete structure with car silhouettes.
      return (
        <svg {...common}>
          {SVG_DEFS}
          <rect width="320" height="128" className="fill-[url(#re-sky-slate)]" />
          {/* Structure */}
          <g fill={ink} opacity="0.85">
            <rect x="40" y="20" width="240" height="92" />
          </g>
          {/* Floor slabs */}
          <g fill="hsl(38 22% 88%)" opacity="0.95">
            <rect x="48" y="30" width="224" height="14" />
            <rect x="48" y="56" width="224" height="14" />
            <rect x="48" y="82" width="224" height="14" />
          </g>
          {/* Car silhouettes (three levels, varying placement) */}
          <g fill={ink} opacity="0.9">
            {/* Level 1 */}
            <path d="M58 44 Q60 38 70 38 L88 38 Q98 38 100 44 L100 44 Z" />
            <path d="M120 44 Q122 38 132 38 L150 38 Q160 38 162 44 Z" />
            <path d="M210 44 Q212 38 222 38 L240 38 Q250 38 252 44 Z" />
            {/* Level 2 */}
            <path d="M76 70 Q78 64 88 64 L106 64 Q116 64 118 70 Z" />
            <path d="M180 70 Q182 64 192 64 L210 64 Q220 64 222 70 Z" />
            <path d="M236 70 Q238 64 248 64 L266 64 Q276 64 278 70 Z" />
            {/* Level 3 */}
            <path d="M58 96 Q60 90 70 90 L88 90 Q98 90 100 96 Z" />
            <path d="M150 96 Q152 90 162 90 L180 90 Q190 90 192 96 Z" />
            <path d="M236 96 Q238 90 248 90 L266 90 Q276 90 278 96 Z" />
          </g>
          {/* Big P sign */}
          <g transform="translate(8, 64)">
            <rect x="-2" y="-22" width="36" height="44" fill={accent} opacity="0.9" rx="2" />
            <text x="16" y="12" textAnchor="middle" fill="hsl(217 28% 12%)" fontSize="38" fontFamily="Inter Tight, sans-serif" fontWeight="700">P</text>
          </g>
          {/* Ground */}
          <rect x="0" y="112" width="320" height="16" fill={ink} opacity="0.35" />
        </svg>
      );
    }

    case 'UNDER_CONSTRUCTION': {
      // Crane silhouette with scaffolded skeletal building, hard-hat warning band.
      const hi = 'hsl(36 80% 55%)';
      return (
        <svg {...common}>
          {SVG_DEFS}
          <rect width="320" height="128" className="fill-[url(#re-sky-day)] dark:fill-[url(#re-sky-night)]" />
          {/* Crane mast */}
          <g stroke={ink} strokeWidth="2" fill="none" opacity="0.9">
            <line x1="80" y1="6" x2="80" y2="106" />
            <line x1="76" y1="6" x2="76" y2="106" />
            {/* Cross-bracing */}
            {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
              <g key={i}>
                <line x1="76" y1={14 + i * 12} x2="80" y2={20 + i * 12} />
                <line x1="80" y1={14 + i * 12} x2="76" y2={20 + i * 12} />
              </g>
            ))}
            {/* Jib */}
            <line x1="78" y1="14" x2="220" y2="14" />
            <line x1="78" y1="22" x2="220" y2="22" />
            {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => (
              <line key={i} x1={88 + i * 14} y1="14" x2={94 + i * 14} y2="22" />
            ))}
            {/* Counter-jib */}
            <line x1="78" y1="18" x2="50" y2="18" />
            {/* Hook line */}
            <line x1="180" y1="22" x2="180" y2="66" stroke={ink} strokeWidth="1" />
          </g>
          {/* Hook */}
          <rect x="174" y="66" width="12" height="6" fill={ink} opacity="0.9" />
          {/* Scaffolded building */}
          <g stroke={ink} strokeWidth="1.4" opacity="0.85" fill="none">
            <rect x="120" y="56" width="120" height="56" />
            <line x1="150" y1="56" x2="150" y2="112" />
            <line x1="180" y1="56" x2="180" y2="112" />
            <line x1="210" y1="56" x2="210" y2="112" />
            <line x1="120" y1="74" x2="240" y2="74" />
            <line x1="120" y1="92" x2="240" y2="92" />
            {/* Diagonal scaffolding */}
            <line x1="120" y1="56" x2="150" y2="74" />
            <line x1="150" y1="56" x2="120" y2="74" />
            <line x1="150" y1="74" x2="180" y2="92" />
            <line x1="180" y1="74" x2="150" y2="92" />
          </g>
          {/* Concrete fill into part of structure */}
          <rect x="120" y="92" width="60" height="20" fill={ink} opacity="0.45" />
          {/* Hard-hat warning band */}
          <g>
            <rect x="0" y="116" width="320" height="12" fill={hi} />
            <g stroke="hsl(217 28% 12%)" strokeWidth="2.4" opacity="0.85">
              {Array.from({ length: 16 }).map((_, i) => (
                <line key={i} x1={-10 + i * 22} y1="128" x2={20 + i * 22} y2="116" />
              ))}
            </g>
          </g>
        </svg>
      );
    }

    case 'OTHER':
    default: {
      // Open landscape — rolling hills with a single tree and sun.
      return (
        <svg {...common}>
          {SVG_DEFS}
          <rect width="320" height="128" className="fill-[url(#re-sky-day)] dark:fill-[url(#re-sky-night)]" />
          <circle cx="240" cy="38" r="18" fill={accent} opacity="0.8" />
          <path d="M0 92 Q80 76 160 86 T320 78 L320 128 L0 128 Z" fill={ink} opacity="0.2" />
          <path d="M0 102 Q80 88 160 98 T320 90 L320 128 L0 128 Z" fill={ink} opacity="0.32" />
          {/* Lone tree */}
          <g fill={ink} opacity="0.85">
            <rect x="62" y="86" width="3" height="20" />
            <circle cx="63.5" cy="80" r="11" />
            <circle cx="56" cy="84" r="8" />
            <circle cx="71" cy="84" r="9" />
          </g>
        </svg>
      );
    }
  }
}

// ── Property banner ───────────────────────────────────────────────────
// Composed scene + editorial overlay (type label, serial №, city stamp,
// brass corner brackets, SOLD diagonal stamp).

interface PropertyBannerProps {
  property: OwnedPropertyDTO;
  isSold: boolean;
}

function PropertyBanner({ property, isSold }: PropertyBannerProps) {
  const TypeIcon = TYPE_ICON[property.propertyType] ?? Building;
  const typeLabel = PROPERTY_TYPE_LABELS[property.propertyType] ?? property.propertyType;
  const serial = property.id.replace(/[^A-Z0-9]/gi, '').slice(-6).toUpperCase();
  const locationLabel = property.city ?? property.address ?? null;

  return (
    <div className="relative h-32 overflow-hidden border-b border-border/70">
      {/* Composed scene */}
      <div className="absolute inset-0">
        <PropertyScene type={property.propertyType} />
      </div>

      {/* Top + bottom haze — keeps overlay text readable */}
      <div className="absolute inset-x-0 top-0 h-9 bg-gradient-to-b from-card/85 via-card/40 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-9 bg-gradient-to-t from-card/85 via-card/40 to-transparent" />

      {/* Brass corner brackets */}
      <div className="absolute top-2 left-2 w-3 h-3 border-t border-l border-accent/70" />
      <div className="absolute top-2 right-2 w-3 h-3 border-t border-r border-accent/70" />
      <div className="absolute bottom-2 left-2 w-3 h-3 border-b border-l border-accent/70" />
      <div className="absolute bottom-2 right-2 w-3 h-3 border-b border-r border-accent/70" />

      {/* Top: type label + serial */}
      <div className="absolute top-2.5 left-5 right-5 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.22em] font-semibold text-foreground">
          <TypeIcon className="h-3 w-3" strokeWidth={2} />
          {typeLabel}
        </span>
        <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
          № {serial}
        </span>
      </div>

      {/* Bottom: city stamp */}
      {locationLabel && (
        <div className="absolute bottom-2.5 left-5 right-5 flex items-center">
          <span className="flex items-center gap-1 text-[10px] uppercase tracking-[0.18em] font-semibold text-foreground">
            <MapPin className="h-3 w-3 text-accent" />
            <span className="truncate max-w-[14rem]">{locationLabel}</span>
          </span>
        </div>
      )}

      {/* SOLD overlay */}
      {isSold && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="font-display text-3xl tracking-[0.25em] text-destructive/85 -rotate-12 border-4 border-destructive/85 px-4 py-1 rounded-sm bg-card/60 backdrop-blur-sm">
            SOLD
          </span>
        </div>
      )}
    </div>
  );
}

function appreciation(p: OwnedPropertyDTO): { gain: Decimal; pct: Decimal | null } {
  const cost = totalCostBasisOf(p);
  const cur = new Decimal(p.currentValue ?? 0);
  const gain = cur.minus(cost);
  const pct = cost.greaterThan(0) ? gain.dividedBy(cost).times(100) : null;
  return { gain, pct };
}

function PropertyCard({
  property,
  onEdit,
  onDelete,
  isDeleting,
}: {
  property: OwnedPropertyDTO;
  onEdit: () => void;
  onDelete: () => void;
  isDeleting: boolean;
}) {
  const { gain, pct } = appreciation(property);
  const gainPositive = gain.greaterThan(0);
  const gainNeutral = gain.isZero();
  const gainColor = gainPositive ? 'text-positive' : gainNeutral ? 'text-muted-foreground' : 'text-negative';
  const isSold = property.status === 'SOLD';
  const statusLabel = PROPERTY_STATUS_LABELS[property.status] ?? property.status;

  const stop = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <Link
      to={`/real-estate/${property.id}`}
      className="block group focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-2 rounded-lg"
    >
      <Card className={`overflow-hidden p-0 cursor-pointer transition-all duration-300 paper relative
        group-hover:shadow-elev-lg group-hover:-translate-y-0.5
        ${isSold ? 'opacity-75' : ''}`}>

        {/* Type-relevant banner */}
        <PropertyBanner property={property} isSold={isSold} />

        {/* Body */}
        <CardContent className="p-5 relative">
          <div className="flex items-start justify-between gap-3 mb-1">
            <div className="min-w-0 flex-1">
              <h3 className="font-sans font-semibold text-[28px] leading-[1.1] tracking-[-0.02em] text-foreground truncate">
                {property.name}
              </h3>
              <p className="font-display-italic text-sm text-muted-foreground mt-2">
                {statusLabel}
              </p>
            </div>
            <div className="flex items-center gap-0.5 shrink-0 -mr-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={(e) => { stop(e); onEdit(); }}
                title="Edit"
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                onClick={(e) => { stop(e); onDelete(); }}
                disabled={isDeleting}
                title="Delete"
              >
                {isDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </div>

          {/* Diamond rule */}
          <div className="rule-ornament my-3"><span /></div>

          {/* Monumental value */}
          {property.currentValue ? (
            <div>
              <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-medium">
                Current value
              </p>
              <p className="numeric-display-lg money-digits text-3xl mt-1">
                {formatINR(property.currentValue)}
              </p>
              {totalCostBasisOf(property).greaterThan(0) && (
                <div className="mt-2 flex items-center gap-2 text-xs">
                  <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm tabular-nums font-medium
                    ${gainPositive ? 'bg-positive/10 text-positive'
                      : gainNeutral ? 'bg-muted text-muted-foreground'
                      : 'bg-negative/10 text-negative'}`}>
                    {gainPositive ? <TrendingUp className="h-3 w-3" />
                      : gainNeutral ? null
                      : <TrendingDown className="h-3 w-3" />}
                    {pct ? `${gainPositive ? '+' : ''}${pct.toFixed(1)}%` : '—'}
                  </span>
                  <span className={`font-display-italic ${gainColor}`}>
                    {gainPositive ? '+' : ''}{formatINR(gain.toString())}
                  </span>
                  <span className="text-muted-foreground/70 ml-auto group-hover:text-accent transition-colors">
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground font-display-italic">
                Current value not set
              </p>
              <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground/70 group-hover:text-accent transition-colors" />
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}

function SummaryStrip({ properties }: { properties: OwnedPropertyDTO[] }) {
  const active = properties.filter((p) => p.status !== 'SOLD').length;
  const totalValue = properties.reduce(
    (s, p) => (p.status === 'SOLD' ? s : s.plus(new Decimal(p.currentValue ?? 0))),
    new Decimal(0),
  );
  const totalCost = properties.reduce(
    (s, p) => (p.status === 'SOLD' ? s : s.plus(totalCostBasisOf(p))),
    new Decimal(0),
  );
  const gain = totalValue.minus(totalCost);
  const gainPositive = gain.greaterThan(0);

  return (
    <div className="grid grid-cols-3 gap-3 mb-6">
      {[
        {
          label: 'Active properties',
          value: String(active),
          sub: `of ${properties.length} total`,
        },
        {
          label: 'Portfolio value',
          value: formatINR(totalValue.toString()),
          sub: 'current estimate',
        },
        {
          label: 'Unrealised gain',
          value: formatINR(gain.toString()),
          sub: 'value − cost basis',
          className: gainPositive ? 'text-positive' : gain.isZero() ? '' : 'text-negative',
        },
      ].map((m) => (
        <Card key={m.label}>
          <CardContent className="px-4 py-3">
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
              {m.label}
            </p>
            <p className={`text-xl font-semibold tabular-nums mt-1 ${m.className ?? ''}`}>
              {m.value}
            </p>
            <p className="text-xs text-muted-foreground">{m.sub}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function RealEstateListPage() {
  const [createOpen, setCreateOpen] = useState(false);
  const [editProperty, setEditProperty] = useState<OwnedPropertyDTO | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const qc = useQueryClient();

  const { data: properties, isLoading } = useQuery({
    queryKey: ['real-estate'],
    queryFn: () => realEstateApi.listProperties(),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => realEstateApi.deleteProperty(id),
    onSuccess: () => {
      toast.success('Property deleted');
      setConfirmDeleteId(null);
      qc.invalidateQueries({ queryKey: ['real-estate'] });
      qc.invalidateQueries({ queryKey: ['real-estate-summary'] });
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Failed to delete')),
  });

  const list = properties ?? [];

  return (
    <div>
      <PageHeader
        title="Real Estate"
        description="Properties you own — homes, plots, commercial. Manual current value, capital-gain on sale, document vault."
        actions={
          <Button onClick={() => { setEditProperty(null); setCreateOpen(true); }}>
            <Plus className="h-4 w-4" /> Add property
          </Button>
        }
      />

      {!isLoading && list.length > 0 && <SummaryStrip properties={list} />}

      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="h-44 animate-pulse bg-muted/60" />
          ))}
        </div>
      )}

      {!isLoading && list.length === 0 && (
        <EmptyState
          icon={Home}
          title="No properties yet"
          description="Add a property to track purchase cost, current value, documents, and tax obligations."
          action={
            <Button onClick={() => { setEditProperty(null); setCreateOpen(true); }}>
              <Plus className="h-4 w-4" /> Add your first property
            </Button>
          }
        />
      )}

      {!isLoading && list.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {list.map((p) => (
            <div key={p.id}>
              {confirmDeleteId === p.id ? (
                <Card className="border-destructive">
                  <CardContent className="p-5 flex items-center justify-between gap-3">
                    <p className="text-sm font-medium">Delete "{p.name}"?</p>
                    <div className="flex gap-2">
                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={deleteMutation.isPending}
                        onClick={() => deleteMutation.mutate(p.id)}
                      >
                        {deleteMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Yes, delete'}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setConfirmDeleteId(null)}>
                        Cancel
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <PropertyCard
                  property={p}
                  onEdit={() => { setEditProperty(p); setCreateOpen(true); }}
                  onDelete={() => setConfirmDeleteId(p.id)}
                  isDeleting={deleteMutation.isPending && confirmDeleteId === p.id}
                />
              )}
            </div>
          ))}
        </div>
      )}

      <PropertyFormDialog
        open={createOpen}
        onOpenChange={(v) => { setCreateOpen(v); if (!v) setEditProperty(null); }}
        initial={editProperty}
      />
    </div>
  );
}
