import { redirect } from 'next/navigation';
import { ButtonLink, EmptyState, PageHeader, Section } from '@/components/console/kit';
import { DeletePolicyButton } from '@/components/console/delete-policy-button';
import { Badge, Callout } from '@/components/ui';
import { getT } from '@/lib/i18n-server';
import { getPolicies, isUnauthorized } from '@/lib/server-directory';

export default async function PoliciesPage() {
  const result = await getPolicies();
  if (isUnauthorized(result)) {
    redirect('/login');
  }
  const t = await getT();

  return (
    <>
      <PageHeader
        title={t('policies.title')}
        description={t('policies.description')}
        actions={<ButtonLink href="/console/policies/new">{t('policyForm.new')}</ButtonLink>}
      />

      {!result.ok ? (
        <Callout tone="error">{t('errors.policiesLoad')}</Callout>
      ) : result.data.policies.length === 0 ? (
        <EmptyState>{t('policies.empty')}</EmptyState>
      ) : (
        <div className="flex flex-col gap-4">
          {result.data.policies.map((policy) => (
            <Section
              key={policy.id}
              title={policy.id}
              description={
                <span className="font-mono">
                  {policy.resourceType}.{policy.action}
                </span>
              }
              action={
                <div className="flex items-center gap-3">
                  <Badge tone={policy.effect === 'forbid' ? 'deny' : 'permit'}>
                    {policy.effect}
                  </Badge>
                  <ButtonLink href={`/console/policies/${policy.id}/edit`} variant="secondary">
                    {t('schemaForm.edit')}
                  </ButtonLink>
                  <DeletePolicyButton id={policy.id} />
                </div>
              }
            >
              <div>
                <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
                  {t('policies.condition')}
                </div>
                <pre className="overflow-x-auto rounded-lg bg-surface-2 p-3 font-mono text-xs leading-relaxed text-fg">
                  {JSON.stringify(policy.condition, null, 2)}
                </pre>
              </div>
            </Section>
          ))}
        </div>
      )}
    </>
  );
}
