'use client';

import { useState } from 'react';
import { runCheck, runCheckAs } from '@/lib/client';
import type { Decision, EntityInput } from '@/lib/types';
import { useT } from '../i18n/language-provider';
import { Button, Callout, Spinner } from '../ui';
import { ComboInput, Segmented, SelectField } from './form-kit';
import { DecisionCard } from './decision-card';
import { ReauthNotice } from './reauth-notice';
import { useCatalog } from './use-catalog';

type Mode = 'me' | 'subject';

type Outcome =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'decision'; decision: Decision }
  | { kind: 'reauth' }
  | { kind: 'unavailable' }
  | { kind: 'error'; message: string };

function parseSubject(value: string): EntityInput {
  const separator = value.indexOf(':');
  if (separator === -1) {
    return { type: 'user', id: value.trim() };
  }
  return { type: value.slice(0, separator).trim(), id: value.slice(separator + 1).trim() };
}

export function CheckPanel() {
  const t = useT();
  const catalog = useCatalog();
  const [mode, setMode] = useState<Mode>('subject');
  const [subject, setSubject] = useState('user:bob');
  const [aal, setAal] = useState('1');
  const [resourceType, setResourceType] = useState('document');
  const [resourceId, setResourceId] = useState('onboarding');
  const [verb, setVerb] = useState('read');
  const [outcome, setOutcome] = useState<Outcome>({ kind: 'idle' });

  async function handleCheck(event: React.FormEvent) {
    event.preventDefault();
    setOutcome({ kind: 'loading' });

    const action = `${resourceType}.${verb}`;
    const resource = { type: resourceType, id: resourceId };
    const result =
      mode === 'subject'
        ? await runCheckAs({ subject: parseSubject(subject), action, resource, aal: Number(aal) })
        : await runCheck({ subject: { type: 'user', id: 'self' }, action, resource });

    if (result.status === 'ok') {
      setOutcome({ kind: 'decision', decision: result.data });
    } else if (result.status === 'unauthorized') {
      setOutcome({ kind: 'reauth' });
    } else if (result.status === 'unavailable') {
      setOutcome({ kind: 'unavailable' });
    } else {
      setOutcome({ kind: 'error', message: result.message });
    }
  }

  const loading = outcome.kind === 'loading';
  const action = `${resourceType || '…'}.${verb || '…'}`;

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_1.1fr]">
      <form onSubmit={handleCheck} className="flex flex-col gap-4">
        <p className="text-sm text-muted">{t('check.intro')}</p>

        <div>
          <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted">
            {t('check.evaluateAs')}
          </div>
          <Segmented
            ariaLabel={t('check.evaluateAs')}
            value={mode}
            onChange={setMode}
            options={[
              { value: 'subject', label: t('check.asSubject') },
              { value: 'me', label: t('check.asMe') },
            ]}
          />
          <p className="mt-1.5 text-xs text-muted/90">
            {mode === 'subject' ? t('check.hintSubject') : t('check.hintMe')}
          </p>
        </div>

        {mode === 'subject' ? (
          <div className="grid gap-3 sm:grid-cols-[1.5fr_1fr]">
            <ComboInput
              label={t('check.subject')}
              value={subject}
              onChange={setSubject}
              options={catalog.subjects}
              placeholder="user:bob"
            />
            <SelectField
              label={t('check.aal')}
              value={aal}
              onChange={setAal}
              options={[
                { value: '1', label: t('check.aal1') },
                { value: '2', label: t('check.aal2') },
                { value: '3', label: t('check.aal3') },
                { value: '4', label: t('check.aal4') },
              ]}
            />
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <ComboInput
            label={t('field.resourceType')}
            value={resourceType}
            onChange={setResourceType}
            options={catalog.resourceTypes}
            placeholder="document"
          />
          <ComboInput
            label={t('field.resourceId')}
            value={resourceId}
            onChange={setResourceId}
            options={catalog.objectIdsFor(resourceType)}
            placeholder="onboarding"
          />
        </div>

        <ComboInput
          label={t('field.action')}
          value={verb}
          onChange={setVerb}
          options={catalog.actionsFor(resourceType)}
          placeholder="read"
          hint={t('field.sentAs', { action })}
        />

        <div>
          <Button type="submit" disabled={loading} className="min-w-28">
            {loading ? <Spinner /> : t('check.submit')}
          </Button>
        </div>
      </form>

      <div className="flex flex-col gap-3">
        {outcome.kind === 'idle' ? (
          <div className="flex h-full min-h-40 items-center justify-center rounded-xl border border-dashed border-line text-sm text-muted">
            {t('check.idle')}
          </div>
        ) : null}
        {outcome.kind === 'loading' ? (
          <div className="flex h-full min-h-40 items-center justify-center rounded-xl border border-line text-sm text-muted">
            <Spinner /> <span className="ml-2">{t('check.evaluating')}</span>
          </div>
        ) : null}
        {outcome.kind === 'decision' ? <DecisionCard decision={outcome.decision} /> : null}
        {outcome.kind === 'reauth' ? <ReauthNotice /> : null}
        {outcome.kind === 'unavailable' ? (
          <Callout tone="error">{t('errors.unavailable')}</Callout>
        ) : null}
        {outcome.kind === 'error' ? <Callout tone="error">{outcome.message}</Callout> : null}
      </div>
    </div>
  );
}
