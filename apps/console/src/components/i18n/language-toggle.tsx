'use client';

import { LOCALES, type Locale } from '@/lib/i18n';
import { cn } from '../ui';
import { useI18n } from './language-provider';

const LABELS: Record<Locale, string> = { en: 'EN', es: 'ES' };

export function LanguageToggle({ className }: { className?: string }) {
  const { locale, setLocale, t } = useI18n();
  return (
    <div
      role="group"
      aria-label={t('common.language')}
      className={cn('inline-flex rounded-lg border border-line bg-surface-2 p-0.5', className)}
    >
      {LOCALES.map((option) => {
        const active = locale === option;
        return (
          <button
            key={option}
            type="button"
            onClick={() => setLocale(option)}
            aria-pressed={active}
            className={cn(
              'rounded-md px-2 py-1 text-xs font-semibold transition-colors',
              active ? 'bg-surface text-fg shadow-sm' : 'text-muted hover:text-fg',
            )}
          >
            {LABELS[option]}
          </button>
        );
      })}
    </div>
  );
}
