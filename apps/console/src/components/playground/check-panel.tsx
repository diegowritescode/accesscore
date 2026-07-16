'use client';

import { useState } from 'react';
import { runCheck } from '@/lib/client';
import type { Decision } from '@/lib/types';
import { Button, Callout, Field, Spinner, TextInput } from '../ui';
import { DecisionCard } from './decision-card';
import { ReauthNotice } from './reauth-notice';

type Outcome =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'decision'; decision: Decision }
  | { kind: 'reauth' }
  | { kind: 'unavailable' }
  | { kind: 'error'; message: string };

export function CheckPanel() {
  const [subjectType, setSubjectType] = useState('user');
  const [subjectId, setSubjectId] = useState('demo');
  const [action, setAction] = useState('document.read');
  const [resourceType, setResourceType] = useState('document');
  const [resourceId, setResourceId] = useState('onboarding');
  const [outcome, setOutcome] = useState<Outcome>({ kind: 'idle' });

  async function handleCheck(event: React.FormEvent) {
    event.preventDefault();
    setOutcome({ kind: 'loading' });

    const result = await runCheck({
      subject: { type: subjectType, id: subjectId },
      action,
      resource: { type: resourceType, id: resourceId },
    });

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

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_1.1fr]">
      <form onSubmit={handleCheck} className="flex flex-col gap-4">
        <p className="text-sm text-muted">
          Resolve a single decision. The engine walks the relationship graph and returns permit or
          deny with the reasons behind it.
        </p>

        <div>
          <span className="text-xs font-medium uppercase tracking-wide text-muted">Subject</span>
          <div className="mt-1.5 grid grid-cols-2 gap-2">
            <TextInput
              aria-label="Subject type"
              value={subjectType}
              onChange={(event) => setSubjectType(event.target.value)}
            />
            <TextInput
              aria-label="Subject id"
              value={subjectId}
              onChange={(event) => setSubjectId(event.target.value)}
            />
          </div>
          <p className="mt-1.5 text-xs text-muted/80">
            Checks evaluate as the authenticated principal; the subject fields describe the query.
          </p>
        </div>

        <Field label="Action">
          <TextInput
            value={action}
            onChange={(event) => setAction(event.target.value)}
            placeholder="namespace.verb"
          />
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

        <div>
          <Button type="submit" disabled={loading} className="min-w-28">
            {loading ? <Spinner /> : 'Check'}
          </Button>
        </div>
      </form>

      <div className="flex flex-col gap-3">
        {outcome.kind === 'idle' ? (
          <div className="flex h-full min-h-40 items-center justify-center rounded-xl border border-dashed border-line text-sm text-muted">
            Run a check to see the decision.
          </div>
        ) : null}
        {outcome.kind === 'loading' ? (
          <div className="flex h-full min-h-40 items-center justify-center rounded-xl border border-line text-sm text-muted">
            <Spinner /> <span className="ml-2">Evaluating…</span>
          </div>
        ) : null}
        {outcome.kind === 'decision' ? <DecisionCard decision={outcome.decision} /> : null}
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
