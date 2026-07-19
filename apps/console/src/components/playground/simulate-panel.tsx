'use client';

import { useState } from 'react';
import { runSimulate } from '@/lib/client';
import type { PolicyEffect, SimulateInput, SimulateResponse } from '@/lib/types';
import { Button, Callout, Spinner, cn } from '../ui';
import { ComboInput, Segmented } from './form-kit';
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

export function SimulatePanel() {
  const catalog = useCatalog();
  const [resourceType, setResourceType] = useState('document');
  const [resourceId, setResourceId] = useState('onboarding');
  const [verb, setVerb] = useState('read');
  const [withPolicy, setWithPolicy] = useState(true);
  const [effect, setEffect] = useState<PolicyEffect>('forbid');
  const [condition, setCondition] = useState<unknown>(null);
  const [outcome, setOutcome] = useState<Outcome>({ kind: 'idle' });

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

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <form onSubmit={handleSimulate} className="flex flex-col gap-4">
        <p className="text-sm text-muted">
          Owner-gated and read-only. Evaluate a decision against the live policies and, optionally,
          a proposed policy overlay — then compare. Writes nothing.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <ComboInput
            label="Resource type"
            value={resourceType}
            onChange={setResourceType}
            options={catalog.resourceTypes}
            placeholder="document"
          />
          <ComboInput
            label="Resource id"
            value={resourceId}
            onChange={setResourceId}
            options={catalog.objectIdsFor(resourceType)}
            placeholder="onboarding"
          />
        </div>

        <ComboInput
          label="Action"
          value={verb}
          onChange={setVerb}
          options={catalog.actionsFor(resourceType)}
          placeholder="read"
          hint={
            <>
              Sent as <span className="font-mono">{`${resourceType || '…'}.${verb || '…'}`}</span>
            </>
          }
        />

        <label className="flex items-center gap-2.5 rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-sm">
          <input
            type="checkbox"
            checked={withPolicy}
            onChange={(event) => setWithPolicy(event.target.checked)}
            className="h-4 w-4 accent-[var(--color-brand)]"
          />
          <span>Include a proposed policy overlay</span>
        </label>

        {withPolicy ? (
          <div className="flex flex-col gap-4 rounded-lg border border-line bg-surface-2 p-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-xs font-medium uppercase tracking-wide text-muted">Effect</span>
              <Segmented
                ariaLabel="Effect"
                value={effect}
                onChange={setEffect}
                options={[
                  { value: 'forbid', label: 'forbid' },
                  { value: 'permit', label: 'permit' },
                ]}
              />
              <span className="text-xs text-muted">
                on <span className="font-mono">{`${resourceType || '…'}.${verb || '…'}`}</span> when
              </span>
            </div>

            <ConditionBuilder onChange={setCondition} />
          </div>
        ) : null}

        <div>
          <Button type="submit" disabled={loading} className="min-w-28">
            {loading ? <Spinner /> : 'Simulate'}
          </Button>
        </div>
      </form>

      <div className="flex flex-col gap-3">
        {outcome.kind === 'idle' ? (
          <div className="flex h-full min-h-40 items-center justify-center rounded-xl border border-dashed border-line text-sm text-muted">
            Simulate to compare live and proposed decisions.
          </div>
        ) : null}
        {outcome.kind === 'loading' ? (
          <div className="flex h-full min-h-40 items-center justify-center rounded-xl border border-line text-sm text-muted">
            <Spinner /> <span className="ml-2">Simulating…</span>
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
              {outcome.data.changed
                ? 'The proposed policy changes this decision.'
                : 'The proposed policy does not change this decision.'}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <DecisionCard decision={outcome.data.live} label="Live" compact />
              <DecisionCard decision={outcome.data.decision} label="Proposed" compact />
            </div>
          </>
        ) : null}
        {outcome.kind === 'reauth' ? <ReauthNotice /> : null}
        {outcome.kind === 'unavailable' ? (
          <Callout tone="error">
            Authorization service unavailable. Please try again shortly.
          </Callout>
        ) : null}
        {outcome.kind === 'error' ? <Callout tone="error">{outcome.message}</Callout> : null}
      </div>
    </div>
  );
}
