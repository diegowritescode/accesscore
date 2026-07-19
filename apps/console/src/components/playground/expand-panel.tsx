'use client';

import { useState } from 'react';
import { runExpand } from '@/lib/client';
import type { ExpandResponse } from '@/lib/types';
import { useT } from '../i18n/language-provider';
import { Button, Callout, Spinner } from '../ui';
import { ComboInput } from './form-kit';
import { ReauthNotice } from './reauth-notice';
import { useCatalog } from './use-catalog';

type Outcome =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'subjects'; data: ExpandResponse }
  | { kind: 'reauth' }
  | { kind: 'unavailable' }
  | { kind: 'error'; message: string };

export function ExpandPanel() {
  const t = useT();
  const catalog = useCatalog();
  const [resourceType, setResourceType] = useState('document');
  const [resourceId, setResourceId] = useState('onboarding');
  const [relation, setRelation] = useState('viewer');
  const [outcome, setOutcome] = useState<Outcome>({ kind: 'idle' });

  async function handleExpand(event: React.FormEvent) {
    event.preventDefault();
    setOutcome({ kind: 'loading' });

    const result = await runExpand({
      resource: { type: resourceType, id: resourceId },
      relation,
    });

    if (result.status === 'ok') {
      setOutcome({ kind: 'subjects', data: result.data });
    } else if (result.status === 'unauthorized') {
      setOutcome({ kind: 'reauth' });
    } else if (result.status === 'unavailable') {
      setOutcome({ kind: 'unavailable' });
    } else {
      setOutcome({ kind: 'error', message: result.message });
    }
  }

  const loading = outcome.kind === 'loading';

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_1.1fr]">
      <form onSubmit={handleExpand} className="flex flex-col gap-4">
        <p className="text-sm text-muted">{t('expand.intro')}</p>

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
          label={t('expand.relation')}
          value={relation}
          onChange={setRelation}
          options={catalog.relationsFor(resourceType)}
          placeholder="viewer"
        />

        <div>
          <Button type="submit" disabled={loading} className="min-w-28">
            {loading ? <Spinner /> : t('expand.submit')}
          </Button>
        </div>
      </form>

      <div className="flex flex-col gap-3">
        {outcome.kind === 'idle' ? (
          <div className="flex h-full min-h-40 items-center justify-center rounded-xl border border-dashed border-line text-sm text-muted">
            {t('expand.idle')}
          </div>
        ) : null}
        {outcome.kind === 'loading' ? (
          <div className="flex h-full min-h-40 items-center justify-center rounded-xl border border-line text-sm text-muted">
            <Spinner /> <span className="ml-2">{t('expand.resolving')}</span>
          </div>
        ) : null}
        {outcome.kind === 'subjects' ? (
          <div className="rounded-xl border border-line bg-surface-2 p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wide text-muted">
                {t('expand.subjectClosure')}
              </span>
              <span className="font-mono text-xs text-muted">
                {t(
                  outcome.data.subjects.length === 1 ? 'expand.subjectsOne' : 'expand.subjectsMany',
                  { count: outcome.data.subjects.length },
                )}
              </span>
            </div>
            {outcome.data.subjects.length > 0 ? (
              <ul className="mt-3 flex flex-wrap gap-2">
                {outcome.data.subjects.map((subject) => (
                  <li
                    key={`${subject.type}:${subject.id}`}
                    className="rounded-full border border-line-strong bg-surface px-3 py-1 font-mono text-xs"
                  >
                    <span className="text-brand-strong">{subject.type}</span>
                    <span className="text-muted">:</span>
                    <span className="text-fg">{subject.id}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-muted">{t('expand.noSubjects')}</p>
            )}
          </div>
        ) : null}
        {outcome.kind === 'reauth' ? <ReauthNotice /> : null}
        {outcome.kind === 'unavailable' ? (
          <Callout tone="error">{t('errors.unavailable')}</Callout>
        ) : null}
        {outcome.kind === 'error' ? <Callout tone="error">{outcome.message}</Callout> : null}
      </div>
    </div>
  );
}
