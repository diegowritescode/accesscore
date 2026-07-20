'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useT } from '@/components/i18n/language-provider';
import { ChoiceField } from '@/components/playground/form-kit';
import { useCatalog } from '@/components/playground/use-catalog';
import { Button, Callout, Field, Mono, TextInput } from '@/components/ui';
import { writeTuple } from '@/lib/client';

type State =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'ok'; token: string }
  | { kind: 'error'; message: string };

export function TupleForm() {
  const t = useT();
  const router = useRouter();
  const catalog = useCatalog();

  const [objectType, setObjectType] = useState('');
  const [objectId, setObjectId] = useState('');
  const [relation, setRelation] = useState('');
  const [subjectType, setSubjectType] = useState('user');
  const [subjectId, setSubjectId] = useState('');
  const [subjectRelation, setSubjectRelation] = useState('');
  const [state, setState] = useState<State>({ kind: 'idle' });

  useEffect(() => {
    if (objectType === '' && catalog.resourceTypes.length > 0) {
      setObjectType(catalog.resourceTypes[0] ?? '');
    }
  }, [catalog.resourceTypes, objectType]);

  const relations = catalog.relationsFor(objectType);
  useEffect(() => {
    if (relations.length > 0 && !relations.includes(relation)) {
      setRelation(relations[0] ?? '');
    }
  }, [relations, relation]);

  const canSubmit =
    objectType.trim() !== '' &&
    objectId.trim() !== '' &&
    relation.trim() !== '' &&
    subjectType.trim() !== '' &&
    subjectId.trim() !== '' &&
    state.kind !== 'saving';

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }
    setState({ kind: 'saving' });
    const result = await writeTuple({
      object: { type: objectType.trim(), id: objectId.trim() },
      relation: relation.trim(),
      subject: {
        type: subjectType.trim(),
        id: subjectId.trim(),
        ...(subjectRelation.trim() ? { relation: subjectRelation.trim() } : {}),
      },
    });

    if (result.status === 'unauthorized') {
      router.push('/login');
      return;
    }
    if (result.status === 'unavailable') {
      setState({ kind: 'error', message: t('errors.unavailable') });
      return;
    }
    if (result.status === 'error') {
      setState({ kind: 'error', message: result.message });
      return;
    }

    setState({ kind: 'ok', token: result.data.consistency_token });
    setObjectId('');
    setSubjectId('');
    setSubjectRelation('');
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <ChoiceField
          label={t('relationships.fObjectType')}
          value={objectType}
          onChange={setObjectType}
          options={catalog.resourceTypes}
        />
        <Field label={t('relationships.fObjectId')} className="sm:col-span-2">
          <TextInput
            value={objectId}
            onChange={(event) => setObjectId(event.target.value)}
            placeholder={t('relationships.objectIdPlaceholder')}
            className="font-mono"
          />
        </Field>
      </div>

      <ChoiceField
        label={t('relationships.fRelation')}
        value={relation}
        onChange={setRelation}
        options={relations}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label={t('relationships.fSubjectType')}>
          <TextInput
            value={subjectType}
            onChange={(event) => setSubjectType(event.target.value)}
            placeholder="user"
            className="font-mono"
          />
        </Field>
        <Field label={t('relationships.fSubjectId')}>
          <TextInput
            value={subjectId}
            onChange={(event) => setSubjectId(event.target.value)}
            placeholder={t('relationships.subjectIdPlaceholder')}
            className="font-mono"
          />
        </Field>
        <Field
          label={t('relationships.fSubjectRelation')}
          hint={t('relationships.subjectRelationHint')}
        >
          <TextInput
            value={subjectRelation}
            onChange={(event) => setSubjectRelation(event.target.value)}
            placeholder={t('relationships.optional')}
            className="font-mono"
          />
        </Field>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={!canSubmit}>
          {state.kind === 'saving' ? t('relationships.writing') : t('relationships.write')}
        </Button>
        {state.kind === 'ok' ? (
          <span className="text-sm text-muted">
            {t('relationships.writeOk')} <Mono>{state.token}</Mono>
          </span>
        ) : null}
      </div>

      {state.kind === 'error' ? <Callout tone="error">{state.message}</Callout> : null}
    </form>
  );
}
