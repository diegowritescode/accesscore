import type { Decision, Reason } from '@/lib/types';
import { cn } from '../ui';

function ReasonRow({ reason }: { reason: Reason }) {
  return (
    <li className="rounded-lg border border-line bg-ink/60 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-xs text-brand-strong">
          {reason.code}
        </code>
        {reason.relation ? (
          <span className="font-mono text-xs text-muted">relation: {reason.relation}</span>
        ) : null}
      </div>
      <p className="mt-1.5 text-sm text-fg">{reason.message}</p>
      {reason.path && reason.path.length > 0 ? (
        <ol className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
          {reason.path.map((step, index) => (
            <li key={`${step}-${index}`} className="flex items-center gap-1.5">
              <span className="rounded bg-surface-2 px-2 py-1 font-mono text-brand-strong">
                {step}
              </span>
              {index < reason.path!.length - 1 ? (
                <span aria-hidden className="text-muted">
                  →
                </span>
              ) : null}
            </li>
          ))}
        </ol>
      ) : null}
    </li>
  );
}

export function DecisionCard({
  decision,
  label,
  compact = false,
}: {
  decision: Decision;
  label?: string;
  compact?: boolean;
}) {
  const permit = decision.effect === 'permit';

  return (
    <div
      className={cn(
        'rounded-xl border p-4',
        permit ? 'border-permit/40 bg-permit/10' : 'border-deny/40 bg-deny/10',
      )}
    >
      <div className="flex items-center justify-between gap-3">
        {label ? (
          <span className="text-xs font-medium uppercase tracking-wide text-muted">{label}</span>
        ) : null}
        <span
          className={cn(
            'inline-flex items-center gap-2 rounded-lg px-3 py-1.5 font-mono text-sm font-bold tracking-wider',
            compact ? 'text-sm' : 'text-lg',
            permit ? 'bg-permit/20 text-permit' : 'bg-deny/20 text-deny',
          )}
        >
          <span
            aria-hidden
            className={cn('h-2.5 w-2.5 rounded-full', permit ? 'bg-permit' : 'bg-deny')}
          />
          {permit ? 'PERMIT' : 'DENY'}
        </span>
      </div>

      {decision.reasons.length > 0 ? (
        <ul className="mt-4 flex flex-col gap-2">
          {decision.reasons.map((reason, index) => (
            <ReasonRow key={`${reason.code}-${index}`} reason={reason} />
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-muted">No reasons returned.</p>
      )}
    </div>
  );
}
