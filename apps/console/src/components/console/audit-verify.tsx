'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useT } from '@/components/i18n/language-provider';
import { Badge, Button, Callout, Spinner } from '@/components/ui';
import { verifyAudit } from '@/lib/client';
import type { ChainVerification } from '@/lib/types';

export function AuditVerify({ initial }: { initial: ChainVerification | null }) {
  const t = useT();
  const router = useRouter();
  const [result, setResult] = useState<ChainVerification | null>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(
    initial === null ? t('errors.unavailable') : null,
  );

  async function run() {
    setBusy(true);
    setError(null);
    const response = await verifyAudit();
    if (response.status === 'unauthorized') {
      router.push('/login');
      return;
    }
    if (response.status !== 'ok') {
      setBusy(false);
      setError(response.status === 'error' ? response.message : t('errors.unavailable'));
      return;
    }
    setResult(response.data);
    setBusy(false);
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">{t('audit.intro')}</p>

      {error ? <Callout tone="error">{error}</Callout> : null}

      {result ? (
        result.ok ? (
          <Callout tone="info">
            <span className="inline-flex items-center gap-2">
              <Badge tone="permit">{t('audit.intact')}</Badge>
              {t('audit.records', { count: result.length })}
            </span>
          </Callout>
        ) : (
          <Callout tone="error">
            <span className="inline-flex items-center gap-2">
              <Badge tone="deny">{t('audit.broken')}</Badge>
              {t('audit.brokenAt', { index: result.brokenAt ?? 0, count: result.length })}
            </span>
          </Callout>
        )
      ) : null}

      <div>
        <Button type="button" variant="secondary" onClick={run} disabled={busy}>
          {busy ? (
            <>
              <Spinner className="h-4 w-4" /> {t('audit.verifying')}
            </>
          ) : (
            t('audit.reverify')
          )}
        </Button>
      </div>
    </div>
  );
}
