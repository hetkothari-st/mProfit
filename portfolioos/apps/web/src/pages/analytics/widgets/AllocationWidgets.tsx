import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Treemap } from 'recharts';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { formatINR, toDecimal } from '@portfolioos/shared';
import type {
  AllocationSlice,
  TreemapNode,
  SectorSlice,
} from '@/api/analytics.api';
import { CHART_COLORS, colorFor } from '../chartColors';

const TOOLTIP_STYLE = {
  background: 'hsl(var(--popover))',
  border: '1px solid hsl(var(--border))',
  borderRadius: '8px',
  fontSize: 12,
  padding: '10px 12px',
  boxShadow: '0 12px 28px -16px hsl(var(--shadow-color) / 0.35)',
};

interface ClassPieProps {
  slices: AllocationSlice[];
}

export function AllocationByClassPie({ slices }: ClassPieProps) {
  const data = slices.filter((s) => toDecimal(s.value).gt(0));
  return (
    <Card>
      <CardHeader className="pb-2">
        <p className="text-[10px] uppercase tracking-kerned text-accent-ink/80 mb-1">Composition</p>
        <CardTitle>Allocation by class</CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="h-56 grid place-items-center text-sm text-muted-foreground border border-dashed rounded-md">
            No holdings yet
          </div>
        ) : (
          <div>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={data}
                  dataKey="pct"
                  nameKey="label"
                  cx="50%"
                  cy="50%"
                  innerRadius={56}
                  outerRadius={96}
                  paddingAngle={2}
                >
                  {data.map((entry, i) => (
                    <Cell key={entry.key} fill={colorFor(i)} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  formatter={(_v: number, _n: string, p: { payload?: { label?: string; value?: string; pct?: number } }) => [
                    `${formatINR(p.payload?.value ?? '0')} (${(p.payload?.pct ?? 0).toFixed(1)}%)`,
                    p.payload?.label ?? '',
                  ]}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="mt-3 space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {data.map((s, i) => (
                <div key={s.key} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="inline-block h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ background: colorFor(i) }} />
                    <span className="truncate text-muted-foreground">{s.label}</span>
                  </div>
                  <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                    <span className="tabular-nums text-muted-foreground">{formatINR(s.value)}</span>
                    <span className="tabular-nums font-medium w-12 text-right">{s.pct.toFixed(1)}%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface TreemapProps {
  nodes: TreemapNode[];
}

interface TreemapTickContent {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  name?: string;
  pct?: number;
  index?: number;
}

function TreemapContent(props: TreemapTickContent) {
  const { x = 0, y = 0, width = 0, height = 0, name = '', pct = 0, index = 0 } = props;
  if (width < 18 || height < 18) {
    return (
      <g>
        <rect x={x} y={y} width={width} height={height} stroke="hsl(var(--background))" strokeWidth={1} fill={colorFor(index)} />
      </g>
    );
  }
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} stroke="hsl(var(--background))" strokeWidth={1} fill={colorFor(index)} />
      {width > 60 && height > 30 && (
        <>
          <text x={x + 6} y={y + 16} fill="#fff" fontSize={11} fontWeight={500} style={{ pointerEvents: 'none' }}>
            {name.length > Math.floor(width / 7) ? name.slice(0, Math.floor(width / 7)) + '…' : name}
          </text>
          <text x={x + 6} y={y + 30} fill="rgba(255,255,255,0.85)" fontSize={10} style={{ pointerEvents: 'none' }}>
            {pct.toFixed(1)}%
          </text>
        </>
      )}
    </g>
  );
}

export function AllocationTreemap({ nodes }: TreemapProps) {
  // Recharts treemap needs `{name, size}` shape.
  const data = nodes
    .map((n, i) => ({
      name: n.assetName,
      size: toDecimal(n.value).toNumber(),
      pct: n.pct,
      index: i,
    }))
    .filter((n) => n.size > 0);
  return (
    <Card>
      <CardHeader className="pb-2">
        <p className="text-[10px] uppercase tracking-kerned text-accent-ink/80 mb-1">Holdings</p>
        <CardTitle>Allocation by holding</CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="h-56 grid place-items-center text-sm text-muted-foreground border border-dashed rounded-md">
            No holdings yet
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <Treemap
              data={data}
              dataKey="size"
              stroke="hsl(var(--background))"
              fill="hsl(var(--accent))"
              // Recharts' typed `content` prop is overly narrow — it accepts
              // a render fn at runtime but TS rejects it. Casting unblocks.
              content={((props: TreemapTickContent) => (
                <TreemapContent {...props} />
              )) as unknown as React.ReactElement}
            >
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                formatter={(v: number | string, _n: string, p: { payload?: { name?: string; pct?: number } }) => [
                  `${formatINR(toDecimal(v).toFixed(4))} (${(p.payload?.pct ?? 0).toFixed(1)}%)`,
                  p.payload?.name ?? '',
                ]}
              />
            </Treemap>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

interface SectorPieProps {
  slices: SectorSlice[];
}

export function SectorPie({ slices }: SectorPieProps) {
  const data = slices.filter((s) => toDecimal(s.value).gt(0));
  return (
    <Card>
      <CardHeader className="pb-2">
        <p className="text-[10px] uppercase tracking-kerned text-accent-ink/80 mb-1">Equity exposure</p>
        <CardTitle>Sector allocation</CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="h-56 grid place-items-center text-sm text-muted-foreground border border-dashed rounded-md">
            No equity holdings to classify
          </div>
        ) : (
          <div>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={data}
                  dataKey="pct"
                  nameKey="sector"
                  cx="50%"
                  cy="50%"
                  outerRadius={92}
                  paddingAngle={1}
                  label={(entry: { pct: number }) => (entry.pct > 6 ? `${entry.pct.toFixed(0)}%` : '')}
                  labelLine={false}
                >
                  {data.map((entry, i) => (
                    <Cell key={entry.sector} fill={CHART_COLORS[(i + 2) % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  formatter={(_v: number, _n: string, p: { payload?: { sector?: string; value?: string; pct?: number } }) => [
                    `${formatINR(p.payload?.value ?? '0')} (${(p.payload?.pct ?? 0).toFixed(1)}%)`,
                    p.payload?.sector ?? '',
                  ]}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="mt-3 space-y-1.5 max-h-32 overflow-y-auto pr-1">
              {data.map((s, i) => (
                <div key={s.sector} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="inline-block h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ background: CHART_COLORS[(i + 2) % CHART_COLORS.length] }} />
                    <span className="truncate text-muted-foreground">{s.sector}</span>
                  </div>
                  <span className="tabular-nums font-medium w-12 text-right">{s.pct.toFixed(1)}%</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
