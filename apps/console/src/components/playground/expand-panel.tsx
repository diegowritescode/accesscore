'use client';

import { useState } from 'react';
import { runExpand } from '@/lib/client';
import type { ExpandResponse } from '@/lib/types';
import { Button, Callout, Field, Spinner, TextInput } from '../ui';
import { ReauthNotice } from './reauth-notice';

type Outcome =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'subjects'; data: ExpandResponse }
  | { kind: 'reauth' }
  | { kind: 'unavailable' }
  | { kind: 'error'; message: string };

export function ExpandPanel() {
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
        <p className="text-sm text-muted">
          Owner-gated. Resolve the full set of subjects that hold a relation on a resource, across
          role aliases, nested groups, and hierarchy.
        </p>

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

        <Field label="Relation">
          <TextInput value={relation} onChange={(event) => setRelation(event.target.value)} />
        </Field>

        <div>
          <Button type="submit" disabled={loading} className="min-w-28">
            {loading ? <Spinner /> : 'Expand'}
          </Button>
        </div>
      </form>

      <div className="flex flex-col gap-3">
        {outcome.kind === 'idle' ? (
          <div className="flex h-full min-h-40 items-center justify-center rounded-xl border border-dashed border-line text-sm text-muted">
            Expand a relation to see its subject closure.
          </div>
        ) : null}
        {outcome.kind === 'loading' ? (
          <div className="flex h-full min-h-40 items-center justify-center rounded-xl border border-line text-sm text-muted">
            <Spinner /> <span className="ml-2">Resolving…</span>
          </div>
        ) : null}
        {outcome.kind === 'subjects' ? (
          <div className="rounded-xl border border-line bg-ink/60 p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wide text-muted">
                Subject closure
              </span>
              <span className="font-mono text-xs text-muted">
                {outcome.data.subjects.length} subject
                {outcome.data.subjects.length === 1 ? '' : 's'}
              </span>
            </div>
            {outcome.data.subjects.length > 0 ? (
              <ul className="mt-3 flex flex-wrap gap-2">
                {outcome.data.subjects.map((subject) => (
                  <li
                    key={`${subject.type}:${subject.id}`}
                    className="rounded-full border border-line-strong bg-surface-2 px-3 py-1 font-mono text-xs"
                  >
                    <span className="text-brand-strong">{subject.type}</span>
                    <span className="text-muted">:</span>
                    <span className="text-fg">{subject.id}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-muted">No subjects hold this relation.</p>
            )}
          </div>
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
