import { UNGRADED } from '@/api/intelligence.api';

/** Too little data to grade: an empty ring, not a number that means nothing. */
function UngradedGauge({ size }: { size: number }) {
  const stroke = 14;
  const radius = (size - stroke) / 2;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Health score: not enough data to grade yet">
      <circle
        cx={size / 2} cy={size / 2} r={radius}
        fill="none" stroke="currentColor" strokeOpacity={0.12} strokeWidth={stroke}
      />
      <text x="50%" y="46%" textAnchor="middle" dominantBaseline="middle" fontSize={size * 0.22} fontWeight={700} fill="currentColor" fillOpacity={0.45}>
        —
      </text>
      {size >= 120 && (
        <text x="50%" y="64%" textAnchor="middle" dominantBaseline="middle" fontSize={size * 0.075} fill="currentColor" fillOpacity={0.55}>
          Not enough data
        </text>
      )}
    </svg>
  );
}

interface HealthScoreGaugeProps {
  score: number;
  grade: string;
  size?: number;
}

function gaugeColor(score: number): string {
  if (score < 40) return '#ef4444';
  if (score < 70) return '#f97316';
  return '#22c55e';
}

export function HealthScoreGauge({ score, grade, size = 200 }: HealthScoreGaugeProps) {
  if (grade === UNGRADED) return <UngradedGauge size={size} />;
  const stroke = 14;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, score));
  const offset = circumference * (1 - clamped / 100);
  const color = gaugeColor(clamped);

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`Health score ${score} out of 100, grade ${grade}`}>
      <circle
        cx={size / 2} cy={size / 2} r={radius}
        fill="none" stroke="currentColor" strokeOpacity={0.12} strokeWidth={stroke}
      />
      <circle
        cx={size / 2} cy={size / 2} r={radius}
        fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={circumference} strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dashoffset 0.6s ease' }}
      />
      <text x="50%" y="46%" textAnchor="middle" dominantBaseline="middle" fontSize={size * 0.22} fontWeight={700} fill="currentColor">
        {Math.round(clamped)}
      </text>
      <text x="50%" y="64%" textAnchor="middle" dominantBaseline="middle" fontSize={size * 0.12} fill={color} fontWeight={600}>
        {grade}
      </text>
    </svg>
  );
}
