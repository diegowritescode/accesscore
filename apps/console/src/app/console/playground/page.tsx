import { PageHeader } from '@/components/console/kit';
import { Playground } from '@/components/playground/playground';
import { getT } from '@/lib/i18n-server';

export default async function PlaygroundPage() {
  const t = await getT();
  return (
    <>
      <PageHeader title={t('playground.title')} description={t('playground.description')} />
      <Playground />
    </>
  );
}
