import { PageHeader, Section } from '@/components/console/kit';
import { PolicyForm } from '@/components/console/policy-form';
import { getT } from '@/lib/i18n-server';

export default async function NewPolicyPage() {
  const t = await getT();
  return (
    <>
      <PageHeader title={t('policyForm.newTitle')} description={t('policyForm.newDescription')} />
      <Section title={t('policyForm.definition')}>
        <PolicyForm />
      </Section>
    </>
  );
}
