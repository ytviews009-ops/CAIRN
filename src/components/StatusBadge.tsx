import type { ConnectionStatus } from '@/types';

export function StatusBadge({ status }: { status: ConnectionStatus }) {
  const config = {
    online: { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200', dot: 'bg-green-500', label: 'ONLINE' },
    offline: { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200', dot: 'bg-orange-500', label: 'OFFLINE' },
    syncing: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', dot: 'bg-blue-500', label: 'SYNCING' },
    conflicts: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', dot: 'bg-amber-500', label: 'CONFLICTS' },
  };
  const c = config[status];
  const animate = status === 'syncing' || status === 'online';

  return (
    <div
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold tracking-wide transition-colors duration-300 ${c.bg} ${c.text} border ${c.border}`}
    >
      <span className="relative flex items-center justify-center">
        {animate && (
          <span className={`absolute h-2.5 w-2.5 rounded-full opacity-60 animate-ping ${c.dot}`} />
        )}
        <span className={`relative h-2 w-2 rounded-full ${c.dot}`} />
      </span>
      {c.label}
    </div>
  );
}
