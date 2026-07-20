import { redirect } from 'next/navigation';
import { PageHeader, Section } from '@/components/console/kit';
import { PolicyForm } from '@/components/console/policy-form';
import { Callout } from '@/components/ui';
import { getT } from '@/lib/i18n-server';
import { getPolicies, isUnauthorized } from '@/lib/server-directory';

export default async function EditPolicyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await getPolicies();
  if (isUnauthorized(result)) {
    redirect('/login');
  }
  const t = await getT();

  if (!result.ok) {
    return (
      <>
        <PageHeader title={t('policyForm.editTitle')} />
        <Callout tone="error">{t('errors.policiesLoad')}</Callout>
      </>
    );
  }

  const policy = result.data.policies.find((candidate) => candidate.id === id);
  if (!policy) {
    return (
      <>
        <PageHeader title={t('policyForm.editTitle')} />
        <Callout tone="error">{t('policyForm.notFound')}</Callout>
      </>
    );
  }

  return (
    <>
      <PageHeader title={t('policyForm.editTitle')} description={t('policyForm.editDescription')} />
      <Section title={policy.id}>
        <PolicyForm initial={policy} />
      </Section>
    </>
  );
}
