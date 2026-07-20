'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useT } from '@/components/i18n/language-provider';
import { Spinner } from '@/components/ui';
import { deletePolicy } from '@/lib/client';

export function DeletePolicyButton({ id }: { id: string }) {
  const t = useT();
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  async function remove() {
    setBusy(true);
    const result = await deletePolicy(id);
    if (result.status === 'unauthorized') {
      router.push('/login');
      return;
    }
    if (result.status !== 'ok') {
      setBusy(false);
      setConfirming(false);
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
      >
        {t('policyForm.delete')}
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={remove}
        className="text-xs font-semibold text-deny transition-colors hover:opacity-80"
      >
        {t('policyForm.deleteConfirm')}
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
