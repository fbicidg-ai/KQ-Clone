import { Loader2 } from 'lucide-react';

export function Spinner({ className = '' }: { className?: string }) {
  return <Loader2 className={`w-5 h-5 animate-spin ${className}`} />;
}

export function FullScreenSpinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3 text-ink-400">
      <Spinner className="w-8 h-8 text-brand-500" />
      <p className="text-sm">{label}</p>
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <div className="w-14 h-14 rounded-2xl bg-ink-800 flex items-center justify-center mb-3">
        <Icon className="w-7 h-7 text-ink-500" />
      </div>
      <p className="font-semibold text-ink-200">{title}</p>
      {hint && <p className="text-sm text-ink-500 mt-1 max-w-xs">{hint}</p>}
    </div>
  );
}

export function StatusBadge({ status, className = '' }: { status: string; className?: string }) {
  const map: Record<string, string> = {
    PENDING: 'bg-warning-100 text-warning-600',
    APPROVED: 'bg-success-100 text-success-700',
    REJECTED: 'bg-danger-100 text-danger-700',
    SETTLED: 'bg-ink-700 text-ink-200',
    WON: 'bg-success-100 text-success-700',
    LOST: 'bg-danger-100 text-danger-700',
    open: 'bg-success-100 text-success-700',
    closed: 'bg-warning-100 text-warning-600',
    settled: 'bg-ink-700 text-ink-200',
  };
  const cls = map[status] ?? 'bg-ink-700 text-ink-200';
  return <span className={`chip ${cls} ${className}`}>{status}</span>;
}

export function Money({ value, className = '' }: { value: number; className?: string }) {
  const formatted = new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
  }).format(value || 0);
  return <span className={`font-mono ${className}`}>{formatted}</span>;
}
