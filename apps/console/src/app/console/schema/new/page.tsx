import { PageHeader, Section } from '@/components/console/kit';
import { NamespaceForm } from '@/components/console/namespace-form';
import { getT } from '@/lib/i18n-server';

export default async function NewNamespacePage() {
  const t = await getT();
  return (
    <>
      <PageHeader title={t('schemaForm.newTitle')} description={t('schemaForm.newDescription')} />
      <Section title={t('schemaForm.definition')}>
        <NamespaceForm />
      </Section>
    </>
  );
}
