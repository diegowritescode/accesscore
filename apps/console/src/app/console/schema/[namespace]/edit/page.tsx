import { redirect } from 'next/navigation';
import { PageHeader, Section } from '@/components/console/kit';
import { NamespaceForm } from '@/components/console/namespace-form';
import { Callout } from '@/components/ui';
import { getT } from '@/lib/i18n-server';
import { getNamespace, isUnauthorized } from '@/lib/server-directory';

export default async function EditNamespacePage({
  params,
}: {
  params: Promise<{ namespace: string }>;
}) {
  const { namespace } = await params;
  const result = await getNamespace(namespace);
  if (isUnauthorized(result)) {
    redirect('/login');
  }
  const t = await getT();

  if (!result.ok) {
    return (
      <>
        <PageHeader title={t('schemaForm.editTitle')} />
        <Callout tone="error">{t('errors.schemaLoad')}</Callout>
      </>
    );
  }

  return (
    <>
      <PageHeader title={t('schemaForm.editTitle')} description={t('schemaForm.editDescription')} />
      <Section title={result.data.namespace}>
        <NamespaceForm initial={result.data} />
      </Section>
    </>
  );
}
