'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useT } from '@/components/i18n/language-provider';
import { Spinner, cn } from '@/components/ui';
import { revokeTuple } from '@/lib/client';
import type { TupleView } from '@/lib/types';

export function RevokeTupleButton({ tuple }: { tuple: TupleView }) {
  const t = useT();
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function revoke() {
    setBusy(true);
    setError(null);
    const result = await revokeTuple({
      object: tuple.object,
      relation: tuple.relation,
      subject: tuple.subject,
    });
    if (result.status === 'unauthorized') {
      router.push('/login');
      return;
    }
    if (result.status !== 'ok') {
      setBusy(false);
      setConfirming(false);
      setError(result.status === 'error' ? result.message : t('errors.unavailable'));
      return;
    }
    router.refresh();
  }

  if (busy) {
    return <Spinner className="h-4 w-4 text-muted" />;
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="text-xs font-medium text-muted transition-colors hover:text-deny"
        title={error ?? undefined}
      >
        {t('relationships.revoke')}
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={revoke}
        className={cn('text-xs font-semibold text-deny transition-colors hover:opacity-80')}
      >
        {t('relationships.revokeConfirm')}
      </button>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        className="text-xs font-medium text-muted transition-colors hover:text-fg"
      >
        {t('common.cancel')}
      </button>
    </span>
  );
}
