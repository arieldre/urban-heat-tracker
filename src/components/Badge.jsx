const styles = {
  // Performance labels
  BEST:        'bg-[rgba(71,255,176,0.12)] text-green border border-[rgba(71,255,176,0.3)]',
  GOOD:        'bg-[rgba(71,200,255,0.1)] text-accent2 border border-[rgba(71,200,255,0.25)]',
  LOW:         'bg-[rgba(255,71,87,0.08)] text-red border border-[rgba(255,71,87,0.2)]',
  LEARNING:    'bg-[rgba(255,170,71,0.1)] text-orange border border-[rgba(255,170,71,0.2)]',
  UNSPECIFIED: 'bg-[rgba(100,100,100,0.1)] text-text2 border border-border',

  // Status
  live:    'bg-[rgba(71,255,176,0.12)] text-green border border-[rgba(71,255,176,0.3)]',
  pending: 'bg-[rgba(232,255,71,0.1)] text-accent border border-[rgba(232,255,71,0.25)]',
  history: 'bg-[rgba(255,71,87,0.08)] text-red border border-[rgba(255,71,87,0.2)]',

  // Format
  '9x16':  'bg-[rgba(100,100,100,0.1)] text-text2 border border-border',
  '16x9':  'bg-[rgba(100,100,100,0.1)] text-text2 border border-border',
  '1x1':   'bg-[rgba(100,100,100,0.1)] text-text2 border border-border',

  // Themes
  'Gameplay':            'bg-[rgba(150,100,255,0.1)] text-purple border border-[rgba(150,100,255,0.2)]',
  'Skill / Mechanics':   'bg-[rgba(71,200,255,0.08)] text-accent2 border border-[rgba(71,200,255,0.15)]',
  'Hype / Social Proof': 'bg-[rgba(255,71,87,0.08)] text-red border border-[rgba(255,71,87,0.15)]',
  'UGC':                 'bg-[rgba(255,170,71,0.1)] text-orange border border-[rgba(255,170,71,0.2)]',
  'Social':              'bg-[rgba(232,255,71,0.08)] text-accent border border-[rgba(232,255,71,0.15)]',

  // Text asset types
  HEADLINE:     'bg-[rgba(71,200,255,0.08)] text-accent2 border border-[rgba(71,200,255,0.15)]',
  DESCRIPTION:  'bg-[rgba(232,255,71,0.08)] text-accent border border-[rgba(232,255,71,0.15)]',
  LONG_HEADLINE:'bg-[rgba(150,100,255,0.1)] text-purple border border-[rgba(150,100,255,0.2)]',
};

export default function Badge({ label, className = '' }) {
  if (!label) return null;
  const style = styles[label] || styles.UNSPECIFIED;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded font-mono text-[10px] font-medium uppercase tracking-wide whitespace-nowrap ${style} ${className}`}>
      {label}
    </span>
  );
}
