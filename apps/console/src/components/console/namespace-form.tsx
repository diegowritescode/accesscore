'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { useT } from '@/components/i18n/language-provider';
import type { Translate } from '@/lib/i18n';
import { Badge, Button, Callout, Field, Mono, Select, TextInput, cn } from '@/components/ui';
import { defineNamespace } from '@/lib/client';
import type { NamespaceDefineInput, NamespaceDetail, Userset } from '@/lib/types';

type Term =
  | { kind: 'this' }
  | { kind: 'computedUserset'; relation: string }
  | { kind: 'tupleToUserset'; tupleset: string; computedUserset: string };

type RewriteEntry = { mode: 'terms'; terms: Term[] } | { mode: 'raw'; value: Userset };

interface ActionRow {
  verb: string;
  relations: string[];
}

const SIMPLE_KINDS = new Set(['this', 'computedUserset', 'tupleToUserset']);

function usersetToTerms(userset: Userset): Term[] | null {
  if (SIMPLE_KINDS.has(userset.kind)) {
    return [userset as Term];
  }
  if (userset.kind === 'union') {
    const terms: Term[] = [];
    for (const child of userset.children) {
      if (!SIMPLE_KINDS.has(child.kind)) {
        return null;
      }
      terms.push(child as Term);
    }
    return terms;
  }
  return null;
}

function termsToUserset(terms: Term[]): Userset | null {
  if (terms.length === 0) {
    return null;
  }
  if (terms.length === 1) {
    return terms[0] as Userset;
  }
  return { kind: 'union', children: terms as Userset[] };
}

function initialRewrites(detail?: NamespaceDetail): Record<string, RewriteEntry> {
  if (!detail) {
    return {};
  }
  const entries: Record<string, RewriteEntry> = {};
  for (const [relation, tree] of Object.entries(detail.rewrites)) {
    const terms = usersetToTerms(tree);
    entries[relation] = terms ? { mode: 'terms', terms } : { mode: 'raw', value: tree };
  }
  return entries;
}

function TermRow({
  term,
  relations,
  onChange,
  onRemove,
  t,
}: {
  term: Term;
  relations: string[];
  onChange: (term: Term) => void;
  onRemove: () => void;
  t: Translate;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface-2 p-2">
      <Select
        value={term.kind}
        onChange={(event) => {
          const kind = event.target.value;
          if (kind === 'this') {
            onChange({ kind: 'this' });
          } else if (kind === 'computedUserset') {
            onChange({ kind: 'computedUserset', relation: relations[0] ?? '' });
          } else {
            onChange({ kind: 'tupleToUserset', tupleset: relations[0] ?? '', computedUserset: '' });
          }
        }}
        className="w-auto"
      >
        <option value="this">{t('schemaForm.termThis')}</option>
        <option value="computedUserset">{t('schemaForm.termComputed')}</option>
        <option value="tupleToUserset">{t('schemaForm.termTupleTo')}</option>
      </Select>

      {term.kind === 'computedUserset' ? (
        <Select
          value={term.relation}
          onChange={(event) => onChange({ kind: 'computedUserset', relation: event.target.value })}
          className="w-auto font-mono"
        >
          {[term.relation, ...relations.filter((r) => r !== term.relation)]
            .filter(Boolean)
            .map((relation) => (
              <option key={relation} value={relation}>
                {relation}
              </option>
            ))}
        </Select>
      ) : null}

      {term.kind === 'tupleToUserset' ? (
        <>
          <Select
            value={term.tupleset}
            onChange={(event) => onChange({ ...term, tupleset: event.target.value })}
            className="w-auto font-mono"
          >
            {[term.tupleset, ...relations.filter((r) => r !== term.tupleset)]
              .filter(Boolean)
              .map((relation) => (
                <option key={relation} value={relation}>
                  {relation}
                </option>
              ))}
          </Select>
          <span className="text-xs text-muted">{t('schemaForm.tupleToArrow')}</span>
          <TextInput
            value={term.computedUserset}
            onChange={(event) => onChange({ ...term, computedUserset: event.target.value })}
            placeholder="viewer"
            className="w-32 font-mono"
          />
        </>
      ) : null}

      <button
        type="button"
        onClick={onRemove}
        className="ml-auto text-xs font-medium text-muted transition-colors hover:text-deny"
      >
        {t('schemaForm.removeTerm')}
      </button>
    </div>
  );
}

export function NamespaceForm({ initial }: { initial?: NamespaceDetail }) {
  const t = useT();
  const router = useRouter();
  const editing = initial !== undefined;

  const [namespace, setNamespace] = useState(initial?.namespace ?? '');
  const [relations, setRelations] = useState<string[]>(initial?.relations ?? []);
  const [relationDraft, setRelationDraft] = useState('');
  const [actions, setActions] = useState<ActionRow[]>(
    initial
      ? Object.entries(initial.actions).map(([verb, rels]) => ({ verb, relations: rels }))
      : [],
  );
  const [rewrites, setRewrites] = useState<Record<string, RewriteEntry>>(initialRewrites(initial));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const canSubmit = useMemo(
    () =>
      namespace.trim() !== '' &&
      relations.length > 0 &&
      actions.every((row) => row.verb.trim() !== '' && row.relations.length > 0) &&
      !saving,
    [namespace, relations, actions, saving],
  );

  function addRelation() {
    const value = relationDraft.trim();
    if (value === '' || relations.includes(value)) {
      setRelationDraft('');
      return;
    }
    setRelations([...relations, value]);
    setRelationDraft('');
  }

  function removeRelation(relation: string) {
    setRelations(relations.filter((r) => r !== relation));
    setActions(
      actions.map((row) => ({ ...row, relations: row.relations.filter((r) => r !== relation) })),
    );
    setRewrites((current) => {
      const next = { ...current };
      delete next[relation];
      return next;
    });
  }

  function setEntryTerms(relation: string, terms: Term[]) {
    setRewrites((current) => ({ ...current, [relation]: { mode: 'terms', terms } }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }
    const actionRecord: Record<string, string[]> = {};
    for (const row of actions) {
      actionRecord[row.verb.trim()] = row.relations;
    }
    const rewriteRecord: Record<string, Userset> = {};
    for (const [relation, entry] of Object.entries(rewrites)) {
      if (entry.mode === 'raw') {
        rewriteRecord[relation] = entry.value;
        continue;
      }
      const tree = termsToUserset(entry.terms);
      if (tree) {
        rewriteRecord[relation] = tree;
      }
    }
    const config: NamespaceDefineInput = { relations, actions: actionRecord };
    if (Object.keys(rewriteRecord).length > 0) {
      config.rewrites = rewriteRecord;
    }

    setSaving(true);
    setError(null);
    const result = await defineNamespace(namespace.trim(), config);
    if (result.status === 'unauthorized') {
      router.push('/login');
      return;
    }
    if (result.status !== 'ok') {
      setSaving(false);
      setError(result.status === 'error' ? result.message : t('errors.unavailable'));
      return;
    }
    router.push('/console/schema');
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-8">
      <Field
        label={t('schemaForm.namespace')}
        hint={editing ? t('schemaForm.namespaceLocked') : undefined}
      >
        <TextInput
          value={namespace}
          onChange={(event) => setNamespace(event.target.value)}
          placeholder="document"
          className="font-mono"
          disabled={editing}
        />
      </Field>

      <section>
        <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
          {t('schemaForm.relations')}
        </div>
        <div className="mb-3 flex flex-wrap gap-1.5">
          {relations.length === 0 ? (
            <span className="text-sm text-muted">{t('schemaForm.noRelations')}</span>
          ) : (
            relations.map((relation) => (
              <span
                key={relation}
                className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface-2 px-2 py-1 text-sm"
              >
                <span className="font-mono">{relation}</span>
                <button
                  type="button"
                  onClick={() => removeRelation(relation)}
                  aria-label={t('schemaForm.removeRelation')}
                  className="text-muted transition-colors hover:text-deny"
                >
                  ×
                </button>
              </span>
            ))
          )}
        </div>
        <div className="flex gap-2">
          <TextInput
            value={relationDraft}
            onChange={(event) => setRelationDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                addRelation();
              }
            }}
            placeholder={t('schemaForm.relationPlaceholder')}
            className="font-mono"
          />
          <Button type="button" variant="secondary" onClick={addRelation}>
            {t('schemaForm.addRelation')}
          </Button>
        </div>
      </section>

      <section>
        <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
          {t('schemaForm.actions')}
        </div>
        <p className="mb-3 text-sm text-muted">{t('schemaForm.actionsHint')}</p>
        <div className="flex flex-col gap-3">
          {actions.map((row, index) => (
            <div key={index} className="rounded-xl border border-line p-3">
              <div className="flex items-center gap-2">
                <TextInput
                  value={row.verb}
                  onChange={(event) =>
                    setActions(
                      actions.map((a, i) => (i === index ? { ...a, verb: event.target.value } : a)),
                    )
                  }
                  placeholder="read"
                  className="w-40 font-mono"
                />
                <span className="text-xs text-muted">{t('schemaForm.actionRequires')}</span>
                <button
                  type="button"
                  onClick={() => setActions(actions.filter((_, i) => i !== index))}
                  className="ml-auto text-xs font-medium text-muted transition-colors hover:text-deny"
                >
                  {t('schemaForm.removeAction')}
                </button>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {relations.length === 0 ? (
                  <span className="text-xs text-muted">{t('schemaForm.defineRelationsFirst')}</span>
                ) : (
                  relations.map((relation) => {
                    const on = row.relations.includes(relation);
                    return (
                      <button
                        key={relation}
                        type="button"
                        onClick={() =>
                          setActions(
                            actions.map((a, i) =>
                              i === index
                                ? {
                                    ...a,
                                    relations: on
                                      ? a.relations.filter((r) => r !== relation)
                                      : [...a.relations, relation],
                                  }
                                : a,
                            ),
                          )
                        }
                        className={cn(
                          'rounded-md border px-2 py-1 font-mono text-xs transition-colors',
                          on
                            ? 'border-brand-strong bg-brand-soft text-brand-strong'
                            : 'border-line text-muted hover:text-fg',
                        )}
                      >
                        {relation}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          ))}
          <div>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setActions([...actions, { verb: '', relations: [] }])}
            >
              {t('schemaForm.addAction')}
            </Button>
          </div>
        </div>
      </section>

      <section>
        <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
          {t('schemaForm.rewrites')}
        </div>
        <p className="mb-3 text-sm text-muted">{t('schemaForm.rewritesHint')}</p>
        {relations.length === 0 ? (
          <span className="text-sm text-muted">{t('schemaForm.defineRelationsFirst')}</span>
        ) : (
          <div className="flex flex-col gap-3">
            {relations.map((relation) => {
              const entry = rewrites[relation];
              return (
                <div key={relation} className="rounded-xl border border-line p-3">
                  <div className="mb-2 flex items-center gap-2">
                    <Badge>{relation}</Badge>
                    <span className="text-xs text-muted">{t('schemaForm.resolvesFrom')}</span>
                  </div>
                  {entry?.mode === 'raw' ? (
                    <div className="flex flex-col gap-1.5">
                      <Callout tone="warning">{t('schemaForm.advancedRewrite')}</Callout>
                      <pre className="overflow-x-auto rounded-lg bg-surface-2 p-3 font-mono text-xs text-fg">
                        {JSON.stringify(entry.value, null, 2)}
                      </pre>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {(entry?.terms ?? []).length === 0 ? (
                        <span className="text-xs text-muted">{t('schemaForm.direct')}</span>
                      ) : (
                        (entry?.terms ?? []).map((term, termIndex) => (
                          <TermRow
                            key={termIndex}
                            term={term}
                            relations={relations}
                            t={t}
                            onChange={(next) =>
                              setEntryTerms(
                                relation,
                                (entry?.terms ?? []).map((tm, i) => (i === termIndex ? next : tm)),
                              )
                            }
                            onRemove={() =>
                              setEntryTerms(
                                relation,
                                (entry?.terms ?? []).filter((_, i) => i !== termIndex),
                              )
                            }
                          />
                        ))
                      )}
                      <div>
                        <button
                          type="button"
                          onClick={() =>
                            setEntryTerms(relation, [...(entry?.terms ?? []), { kind: 'this' }])
                          }
                          className="text-xs font-medium text-brand-strong transition-colors hover:opacity-80"
                        >
                          {t('schemaForm.addTerm')}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {error ? <Callout tone="error">{error}</Callout> : null}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={!canSubmit}>
          {saving
            ? t('schemaForm.saving')
            : editing
              ? t('schemaForm.save')
              : t('schemaForm.create')}
        </Button>
        <button
          type="button"
          onClick={() => router.push('/console/schema')}
          className="text-sm font-medium text-muted transition-colors hover:text-fg"
        >
          {t('common.cancel')}
        </button>
        {editing ? (
          <span className="ml-auto text-xs text-muted">
            {t('schema.revision', { revision: initial.revision })} · <Mono>{namespace}</Mono>
          </span>
        ) : null}
      </div>
    </form>
  );
}
