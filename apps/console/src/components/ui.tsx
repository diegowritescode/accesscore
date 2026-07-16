import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';

export function cn(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ');
}

type ButtonVariant = 'primary' | 'secondary' | 'ghost';

const buttonVariants: Record<ButtonVariant, string> = {
  primary:
    'bg-brand text-white hover:bg-brand-strong disabled:hover:bg-brand shadow-sm shadow-brand/30',
  secondary: 'bg-surface-2 text-fg border border-line hover:border-line-strong',
  ghost: 'text-muted hover:text-fg hover:bg-surface-2',
};

export function Button({
  variant = 'primary',
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-60',
        buttonVariants[variant],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn('flex flex-col gap-1.5', className)}>
      <span className="text-xs font-medium uppercase tracking-wide text-muted">{label}</span>
      {children}
      {hint ? <span className="text-xs text-muted/80">{hint}</span> : null}
    </label>
  );
}

const controlClass =
  'w-full rounded-lg border border-line bg-ink px-3 py-2 text-sm text-fg placeholder:text-muted/50 transition-colors focus:border-brand-strong';

export function TextInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(controlClass, className)} {...props} />;
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(controlClass, 'appearance-none', className)} {...props}>
      {children}
    </select>
  );
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(controlClass, 'font-mono text-xs leading-relaxed', className)}
      {...props}
    />
  );
}

export function Panel({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-line bg-surface p-6 shadow-lg shadow-black/20',
        className,
      )}
    >
      {children}
    </div>
  );
}

type CalloutTone = 'info' | 'error' | 'warning';

const calloutTones: Record<CalloutTone, string> = {
  info: 'border-line-strong bg-surface-2 text-fg',
  error: 'border-deny/40 bg-deny/10 text-deny',
  warning: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
};

export function Callout({
  tone = 'info',
  children,
  className,
}: {
  tone?: CalloutTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('rounded-lg border px-4 py-3 text-sm', calloutTones[tone], className)}>
      {children}
    </div>
  );
}

export function Mono({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <code
      className={cn(
        'rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[0.8em] text-brand-strong',
        className,
      )}
    >
      {children}
    </code>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent',
        className,
      )}
    />
  );
}
