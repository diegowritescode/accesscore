'use client';

import { useState } from 'react';
import { runSimulate } from '@/lib/client';
import type { PolicyEffect, SimulateInput, SimulateResponse } from '@/lib/types';
import { Button, Callout, Field, Select, Spinner, Textarea, TextInput, cn } from '../ui';
import { DecisionCard } from './decision-card';
import { ReauthNotice } from './reauth-notice';

const CONDITION_ALWAYS = JSON.stringify(
  { kind: 'cmp', op: 'eq', left: { kind: 'lit', value: 1 }, right: { kind: 'lit', value: 1 } },
  null,
  2,
);

const CONDITION_REQUIRE_MFA = JSON.stringify(
  {
    kind: 'cmp',
    op: 'ge',
    left: { kind: 'attr', path: 'principal.aal' },
    right: { kind: 'lit', value: 2 },
  },
  null,
  2,
);

const CONDITION_PRESETS: Array<[string, string]> = [
  ['Always applies', CONDITION_ALWAYS],
  ['Require MFA (aal ≥ 2)', CONDITION_REQUIRE_MFA],
];

type Outcome =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'result'; data: SimulateResponse }
  | { kind: 'reauth' }
  | { kind: 'unavailable' }
  | { kind: 'error'; message: string };

export function SimulatePanel() {
  const [action, setAction] = useState('document.read');
  const [resourceType, setResourceType] = useState('document');
  const [resourceId, setResourceId] = useState('onboarding');
  const [withPolicy, setWithPolicy] = useState(true);
  const [effect, setEffect] = useState<PolicyEffect>('forbid');
  const [policyResourceType, setPolicyResourceType] = useState('document');
  const [policyAction, setPolicyAction] = useState('read');
  const [condition, setCondition] = useState(CONDITION_ALWAYS);
  const [outcome, setOutcome] = useState<Outcome>({ kind: 'idle' });

  async function handleSimulate(event: React.FormEvent) {
    event.preventDefault();

    const input: SimulateInput = {
      action,
      resource: { type: resourceType, id: resourceId },
    };

    if (withPolicy) {
      let parsedCondition: unknown;
      try {
        parsedCondition = JSON.parse(condition);
      } catch {
        setOutcome({ kind: 'error', message: 'The condition is not valid JSON.' });
        return;
      }
      input.policies = [
        {
          effect,
          resourceType: policyResourceType,
          action: policyAction,
          condition: parsedCondition,
        },
      ];
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
    <div className="flex flex-col gap-8">
      <div className="grid gap-8 lg:grid-cols-2">
        <form onSubmit={handleSimulate} className="flex flex-col gap-4">
          <p className="text-sm text-muted">
            Owner-gated and read-only. Evaluate a decision against the live policies and,
            optionally, a proposed policy overlay — then compare.
          </p>

          <Field label="Action">
            <TextInput value={action} onChange={(event) => setAction(event.target.value)} />
          </Field>

          <div>
            <span className="text-xs font-medium uppercase tracking-wide text-muted">Resource</span>
            <div className="mt-1.5 grid grid-cols-2 gap-2">
              <TextInput
                aria-label="Resource type"
                value={resourceType}
                onChange={(event) => setResourceType(event.target.value)}
              />
              <TextInput
                aria-label="Resource id"
                value={resourceId}
                onChange={(event) => setResourceId(event.target.value)}
              />
            </div>
          </div>

          <label className="flex items-center gap-2.5 rounded-lg border border-line bg-ink/60 px-3 py-2.5 text-sm">
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
              <div className="grid grid-cols-3 gap-2">
                <Field label="Effect">
                  <Select
                    value={effect}
                    onChange={(event) => setEffect(event.target.value as PolicyEffect)}
                  >
                    <option value="permit">permit</option>
                    <option value="forbid">forbid</option>
                  </Select>
                </Field>
                <Field label="Resource type">
                  <TextInput
                    value={policyResourceType}
                    onChange={(event) => setPolicyResourceType(event.target.value)}
                  />
                </Field>
                <Field label="Action">
                  <TextInput
                    value={policyAction}
                    onChange={(event) => setPolicyAction(event.target.value)}
                  />
                </Field>
              </div>

              <Field label="Condition (JSON AST)">
                <Textarea
                  rows={7}
                  value={condition}
                  onChange={(event) => setCondition(event.target.value)}
                  spellCheck={false}
                />
              </Field>

              <div className="flex flex-wrap gap-2">
                {CONDITION_PRESETS.map(([name, value]) => (
                  <Button
                    key={name}
                    type="button"
                    variant="secondary"
                    className="px-3 py-1.5 text-xs"
                    onClick={() => setCondition(value)}
                  >
                    {name}
                  </Button>
                ))}
              </div>
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
    </div>
  );
}
