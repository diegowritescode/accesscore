'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useT } from '@/components/i18n/language-provider';
import { ChoiceField, Segmented } from '@/components/playground/form-kit';
import { ConditionBuilder, parseCondition } from '@/components/playground/condition-builder';
import { useCatalog } from '@/components/playground/use-catalog';
import { Button, Callout, Field, TextInput } from '@/components/ui';
import { writePolicy } from '@/lib/client';
import type { PolicyEffect, PolicyView, PolicyWriteInput } from '@/lib/types';

const WILDCARD = '*';

export function PolicyForm({ initial }: { initial?: PolicyView }) {
  const t = useT();
  const router = useRouter();
  const catalog = useCatalog();
  const editing = initial !== undefined;

  const representable = initial === undefined ? true : parseCondition(initial.condition) !== null;

  const [id, setId] = useState(initial?.id ?? '');
  const [effect, setEffect] = useState<PolicyEffect>(initial?.effect ?? 'forbid');
  const [resourceType, setResourceType] = useState(initial?.resourceType ?? '');
  const [action, setAction] = useState(initial?.action ?? WILDCARD);
  const [rawMode, setRawMode] = useState(!representable);
  const [condition, setCondition] = useState<unknown>(initial?.condition ?? null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (resourceType === '' && catalog.namespaceNames.length > 0) {
      setResourceType(catalog.namespaceNames[0] ?? '');
    }
  }, [catalog.namespaceNames, resourceType]);

  const actionOptions = [WILDCARD, ...catalog.actionsFor(resourceType)];

  const canSubmit =
    id.trim() !== '' &&
    resourceType.trim() !== '' &&
    action.trim() !== '' &&
    condition !== null &&
    !saving;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }
    const config: PolicyWriteInput = {
      effect,
      resourceType: resourceType.trim(),
      action: action.trim(),
      condition,
    };
    setSaving(true);
    setError(null);
    const result = await writePolicy(id.trim(), config);
    if (result.status === 'unauthorized') {
      router.push('/login');
      return;
    }
    if (result.status !== 'ok') {
      setSaving(false);
      setError(result.status === 'error' ? result.message : t('errors.unavailable'));
      return;
    }
    router.push('/console/policies');
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={t('policyForm.id')} hint={editing ? t('policyForm.idLocked') : undefined}>
          <TextInput
            value={id}
            onChange={(event) => setId(event.target.value)}
            placeholder="require-mfa-on-write"
            className="font-mono"
            disabled={editing}
          />
        </Field>
        <Field label={t('policyForm.effect')}>
          <div className="pt-1">
            <Segmented
              ariaLabel={t('policyForm.effect')}
              value={effect}
              onChange={setEffect}
              options={[
                { value: 'forbid', label: 'forbid' },
                { value: 'permit', label: 'permit' },
              ]}
            />
          </div>
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <ChoiceField
          label={t('policyForm.resourceType')}
          value={resourceType}
          onChange={setResourceType}
          options={catalog.namespaceNames}
        />
        <ChoiceField
          label={t('policyForm.action')}
          value={action}
          onChange={setAction}
          options={actionOptions}
          hint={t('policyForm.actionHint')}
        />
      </div>

      <div>
        <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
          {t('policyForm.condition')}
        </div>
        <p className="mb-3 text-sm text-muted">{t('policyForm.conditionHint')}</p>
        {rawMode ? (
          <div className="flex flex-col gap-2">
            <Callout tone="warning">{t('policyForm.advancedCondition')}</Callout>
            <pre className="overflow-x-auto rounded-lg bg-surface-2 p-3 font-mono text-xs text-fg">
              {JSON.stringify(condition, null, 2)}
            </pre>
            <button
              type="button"
              onClick={() => setRawMode(false)}
              className="self-start text-xs font-medium text-brand-strong transition-colors hover:opacity-80"
            >
              {t('policyForm.replaceWithBuilder')}
            </button>
          </div>
        ) : (
          <ConditionBuilder
            onChange={setCondition}
            initial={editing && representable ? initial.condition : undefined}
          />
        )}
      </div>

      {error ? <Callout tone="error">{error}</Callout> : null}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={!canSubmit}>
          {saving
            ? t('policyForm.saving')
            : editing
              ? t('policyForm.save')
              : t('policyForm.create')}
        </Button>
        <button
          type="button"
          onClick={() => router.push('/console/policies')}
          className="text-sm font-medium text-muted transition-colors hover:text-fg"
        >
          {t('common.cancel')}
        </button>
      </div>
    </form>
  );
}
