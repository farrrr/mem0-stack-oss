type BadgeColor = 'blue' | 'green' | 'red' | 'yellow' | 'purple' | 'cyan' | 'orange';

interface BadgeProps {
  label: string;
  color: BadgeColor;
}

const colorMap: Record<BadgeColor, { bg: string; fg: string }> = {
  blue: { bg: 'var(--color-accent)', fg: '#fff' },
  green: { bg: 'var(--color-success)', fg: '#fff' },
  red: { bg: 'var(--color-danger)', fg: '#fff' },
  yellow: { bg: 'var(--color-warning)', fg: '#1a1b26' },
  purple: { bg: 'var(--color-purple)', fg: '#fff' },
  cyan: { bg: 'var(--color-info)', fg: '#fff' },
  orange: { bg: 'var(--color-orange)', fg: '#1a1b26' },
};

export default function Badge({ label, color }: BadgeProps) {
  const { bg } = colorMap[color];

  return (
    <span
      className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium"
      style={{
        backgroundColor: `color-mix(in srgb, ${bg} 20%, transparent)`,
        color: bg,
        border: `1px solid color-mix(in srgb, ${bg} 30%, transparent)`,
      }}
    >
      {label}
    </span>
  );
}
