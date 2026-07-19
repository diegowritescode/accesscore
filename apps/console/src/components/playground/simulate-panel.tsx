'use client';

import { useState } from 'react';
import { runSimulate } from '@/lib/client';
import type { PolicyEffect, SimulateInput, SimulateResponse } from '@/lib/types';
import { useT } from '../i18n/language-provider';
import { Button, Callout, Spinner, cn } from '../ui';
import { ChoiceField, Segmented } from './form-kit';
import { ConditionBuilder } from './condition-builder';
import { DecisionCard } from './decision-card';
import { ReauthNotice } from './reauth-notice';
import { useCatalog } from './use-catalog';

type Outcome =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'result'; data: SimulateResponse }
  | { kind: 'reauth' }
  | { kind: 'unavailable' }
  | { kind: 'error'; message: string };

const pick = (list: string[], current: string): string =>
  list.includes(current) ? current : (list[0] ?? current);

export function SimulatePanel() {
  const t = useT();
  const catalog = useCatalog();
  const [resourceType, setResourceType] = useState('document');
  const [resourceId, setResourceId] = useState('onboarding');
  const [verb, setVerb] = useState('read');
  const [withPolicy, setWithPolicy] = useState(true);
  const [effect, setEffect] = useState<PolicyEffect>('forbid');
  const [condition, setCondition] = useState<unknown>(null);
  const [outcome, setOutcome] = useState<Outcome>({ kind: 'idle' });

  function changeType(next: string) {
    setResourceType(next);
    setResourceId(pick(catalog.objectIdsFor(next), resourceId));
    setVerb(pick(catalog.actionsFor(next), verb));
  }

  async function handleSimulate(event: React.FormEvent) {
    event.preventDefault();

    const input: SimulateInput = {
      action: `${resourceType}.${verb}`,
      resource: { type: resourceType, id: resourceId },
    };

    if (withPolicy && condition !== null) {
      input.policies = [{ effect, resourceType, action: verb, condition }];
    }

    setOutcome({ kind: 'loading' });
    const result = await runSimulate(input);

    if (result.status === 'ok') {
      setOutcome({ kind: 'result', data: result.data });
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
    <div className="grid gap-8 lg:grid-cols-2">
      <form onSubmit={handleSimulate} className="flex flex-col gap-4">
        <p className="text-sm text-muted">{t('simulate.intro')}</p>

        <div className="grid gap-3 sm:grid-cols-2">
          <ChoiceField
            label={t('field.resourceType')}
            value={resourceType}
            onChange={changeType}
            options={catalog.namespaceNames}
          />
          <ChoiceField
            label={t('field.resourceId')}
            value={resourceId}
            onChange={setResourceId}
            options={catalog.objectIdsFor(resourceType)}
            hint={t('field.resourceIdHint')}
          />
        </div>

        <ChoiceField
          label={t('field.action')}
          value={verb}
          onChange={setVerb}
          options={catalog.actionsFor(resourceType)}
          hint={t('field.sentAs', { action })}
        />

        <label className="flex items-center gap-2.5 rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-sm">
          <input
            type="checkbox"
            checked={withPolicy}
            onChange={(event) => setWithPolicy(event.target.checked)}
            className="h-4 w-4 accent-[var(--color-brand)]"
          />
          <span>{t('simulate.includeOverlay')}</span>
        </label>

        {withPolicy ? (
          <div className="flex flex-col gap-4 rounded-lg border border-line bg-surface-2 p-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-xs font-medium uppercase tracking-wide text-muted">
                {t('simulate.effect')}
              </span>
              <Segmented
                ariaLabel={t('simulate.effect')}
                value={effect}
                onChange={setEffect}
                options={[
                  { value: 'forbid', label: 'forbid' },
                  { value: 'permit', label: 'permit' },
                ]}
              />
              <span className="text-xs text-muted">{t('simulate.onWhen', { action })}</span>
            </div>

            <ConditionBuilder onChange={setCondition} />
          </div>
        ) : null}

        <div>
          <Button type="submit" disabled={loading} className="min-w-28">
            {loading ? <Spinner /> : t('simulate.submit')}
          </Button>
        </div>
      </form>

      <div className="flex flex-col gap-3">
        {outcome.kind === 'idle' ? (
          <div className="flex h-full min-h-40 items-center justify-center rounded-xl border border-dashed border-line text-sm text-muted">
            {t('simulate.idle')}
          </div>
        ) : null}
        {outcome.kind === 'loading' ? (
          <div className="flex h-full min-h-40 items-center justify-center rounded-xl border border-line text-sm text-muted">
            <Spinner /> <span className="ml-2">{t('simulate.simulating')}</span>
          </div>
        ) : null}
        {outcome.kind === 'result' ? (
          <>
            <div
              className={cn(
                'flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium',
                outcome.data.changed
                  ? 'border-warn/30 bg-warn-soft text-warn'
                  : 'border-line bg-surface-2 text-muted',
              )}
            >
              <span
                aria-hidden
                className={cn(
                  'h-2 w-2 rounded-full',
                  outcome.data.changed ? 'bg-warn' : 'bg-muted',
                )}
              />
              {outcome.data.changed ? t('simulate.changed') : t('simulate.unchanged')}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <DecisionCard decision={outcome.data.live} label={t('simulate.live')} compact />
              <DecisionCard
                decision={outcome.data.decision}
                label={t('simulate.proposed')}
                compact
              />
            </div>
          </>
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
