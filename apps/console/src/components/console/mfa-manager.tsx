'use client';

import QRCode from 'qrcode';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useT } from '@/components/i18n/language-provider';
import { Badge, Button, Callout, Field, Mono, TextInput } from '@/components/ui';
import {
  activateMfa,
  disableMfa,
  enrollMfa,
  fetchMfaStatus,
  regenerateRecoveryCodes,
  stepUpMfa,
} from '@/lib/client';
import type { MfaStatus } from '@/lib/types';

interface Enrollment {
  uri: string;
  secret: string;
  qr: string;
}

function RecoveryCodes({
  codes,
  onDone,
  t,
}: {
  codes: string[];
  onDone: () => void;
  t: ReturnType<typeof useT>;
}) {
  return (
    <div className="flex flex-col gap-3">
      <Callout tone="warning">{t('mfa.codesWarning')}</Callout>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-2">
        {codes.map((code) => (
          <code
            key={code}
            className="rounded-md border border-line bg-surface-2 px-3 py-2 text-center font-mono text-sm"
          >
            {code}
          </code>
        ))}
      </div>
      <div>
        <Button type="button" onClick={onDone}>
          {t('mfa.codesDone')}
        </Button>
      </div>
    </div>
  );
}

export function MfaManager({ initialStatus }: { initialStatus: MfaStatus | null }) {
  const t = useT();
  const router = useRouter();

  const [status, setStatus] = useState<MfaStatus | null>(initialStatus);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [code, setCode] = useState('');
  const [freshCodes, setFreshCodes] = useState<string[] | null>(null);
  const [stepUpCode, setStepUpCode] = useState('');
  const [stepUpOk, setStepUpOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refreshStatus() {
    const result = await fetchMfaStatus();
    if (result.status === 'unauthorized') {
      router.push('/login');
      return;
    }
    if (result.status === 'ok') {
      setStatus(result.data);
    }
  }

  function fail(result: { status: 'error'; message: string } | { status: string }) {
    setBusy(false);
    setError('message' in result ? result.message : t('errors.unavailable'));
  }

  async function enable() {
    setBusy(true);
    setError(null);
    const result = await enrollMfa();
    if (result.status === 'unauthorized') {
      router.push('/login');
      return;
    }
    if (result.status !== 'ok') {
      fail(result);
      return;
    }
    const uri = result.data.otpauthUri;
    const secret = new URL(uri).searchParams.get('secret') ?? '';
    const qr = await QRCode.toDataURL(uri, { margin: 1, width: 220 });
    setEnrollment({ uri, secret, qr });
    setBusy(false);
  }

  async function activate() {
    setBusy(true);
    setError(null);
    const result = await activateMfa(code.trim());
    if (result.status === 'unauthorized') {
      router.push('/login');
      return;
    }
    if (result.status !== 'ok') {
      fail(result);
      return;
    }
    setEnrollment(null);
    setCode('');
    setFreshCodes(result.data.recoveryCodes);
    setBusy(false);
    await refreshStatus();
  }

  async function regenerate() {
    setBusy(true);
    setError(null);
    const result = await regenerateRecoveryCodes();
    if (result.status === 'unauthorized') {
      router.push('/login');
      return;
    }
    if (result.status !== 'ok') {
      fail(result);
      return;
    }
    setFreshCodes(result.data.recoveryCodes);
    setBusy(false);
    await refreshStatus();
  }

  async function disable() {
    setBusy(true);
    setError(null);
    const result = await disableMfa();
    if (result.status === 'unauthorized') {
      router.push('/login');
      return;
    }
    if (result.status !== 'ok') {
      fail(result);
      return;
    }
    setBusy(false);
    await refreshStatus();
  }

  async function stepUp() {
    setBusy(true);
    setError(null);
    setStepUpOk(false);
    const result = await stepUpMfa(stepUpCode.trim());
    if (result.status === 'unauthorized') {
      router.push('/login');
      return;
    }
    if (result.status !== 'ok') {
      fail(result);
      return;
    }
    setStepUpCode('');
    setStepUpOk(true);
    setBusy(false);
    router.refresh();
  }

  if (status === null) {
    return <Callout tone="error">{t('errors.unavailable')}</Callout>;
  }

  if (freshCodes) {
    return <RecoveryCodes codes={freshCodes} onDone={() => setFreshCodes(null)} t={t} />;
  }

  if (enrollment) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted">{t('mfa.enrollScan')}</p>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <Image
            src={enrollment.qr}
            alt={t('mfa.qrAlt')}
            width={220}
            height={220}
            unoptimized
            className="rounded-lg border border-line bg-white p-2"
          />
          <div className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted">{t('mfa.enrollManual')}</span>
            <Mono className="break-all">{enrollment.secret}</Mono>
          </div>
        </div>
        <Field label={t('mfa.codeLabel')} hint={t('mfa.codeHint')}>
          <TextInput
            value={code}
            onChange={(event) => setCode(event.target.value)}
            inputMode="numeric"
            placeholder="123456"
            className="w-40 font-mono tracking-widest"
          />
        </Field>
        {error ? <Callout tone="error">{error}</Callout> : null}
        <div className="flex items-center gap-3">
          <Button type="button" onClick={activate} disabled={busy || code.trim().length === 0}>
            {busy ? t('mfa.activating') : t('mfa.activate')}
          </Button>
          <button
            type="button"
            onClick={() => {
              setEnrollment(null);
              setCode('');
              setError(null);
            }}
            className="text-sm font-medium text-muted transition-colors hover:text-fg"
          >
            {t('common.cancel')}
          </button>
        </div>
      </div>
    );
  }

  if (!status.enabled) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted">{t('mfa.disabledIntro')}</p>
        {error ? <Callout tone="error">{error}</Callout> : null}
        <div>
          <Button type="button" onClick={enable} disabled={busy}>
            {busy ? t('mfa.enabling') : t('mfa.enable')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <Badge tone="permit">{t('mfa.enabled')}</Badge>
        <span className="text-sm text-muted">
          {t('mfa.codesRemaining', { count: status.recoveryCodesRemaining })}
        </span>
      </div>

      {error ? <Callout tone="error">{error}</Callout> : null}

      <div className="flex flex-wrap gap-3">
        <Button type="button" variant="secondary" onClick={regenerate} disabled={busy}>
          {t('mfa.regenerate')}
        </Button>
        <Button type="button" variant="secondary" onClick={disable} disabled={busy}>
          {t('mfa.disable')}
        </Button>
      </div>

      <div className="rounded-xl border border-line p-4">
        <div className="mb-1 text-sm font-medium">{t('mfa.stepUpTitle')}</div>
        <p className="mb-3 text-sm text-muted">{t('mfa.stepUpHint')}</p>
        <div className="flex flex-wrap items-end gap-3">
          <Field label={t('mfa.codeLabel')}>
            <TextInput
              value={stepUpCode}
              onChange={(event) => setStepUpCode(event.target.value)}
              placeholder="123456"
              className="w-44 font-mono tracking-widest"
            />
          </Field>
          <Button type="button" onClick={stepUp} disabled={busy || stepUpCode.trim().length === 0}>
            {busy ? t('mfa.elevating') : t('mfa.stepUp')}
          </Button>
        </div>
        {stepUpOk ? (
          <div className="mt-3">
            <Callout tone="info">{t('mfa.stepUpOk')}</Callout>
          </div>
        ) : null}
      </div>
    </div>
  );
}
