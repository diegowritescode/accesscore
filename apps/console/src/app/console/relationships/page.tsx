import { redirect } from 'next/navigation';
import { DataTable, EmptyState, PageHeader, Section, Td, Th } from '@/components/console/kit';
import { RevokeTupleButton } from '@/components/console/revoke-tuple-button';
import { TupleForm } from '@/components/console/tuple-form';
import { Badge, Callout } from '@/components/ui';
import { getT } from '@/lib/i18n-server';
import { getTuples, isUnauthorized } from '@/lib/server-directory';
import type { TupleView } from '@/lib/types';

const LIMIT = 200;

function subjectLabel(subject: TupleView['subject']): string {
  const base = `${subject.type}:${subject.id}`;
  return subject.relation ? `${base}#${subject.relation}` : base;
}

export default async function RelationshipsPage() {
  const result = await getTuples(`limit=${LIMIT}`);
  if (isUnauthorized(result)) {
    redirect('/login');
  }
  const t = await getT();

  return (
    <>
      <PageHeader title={t('relationships.title')} description={t('relationships.description')} />

      <div className="mb-6">
        <Section
          title={t('relationships.addTitle')}
          description={t('relationships.addDescription')}
        >
          <TupleForm />
        </Section>
      </div>

      {!result.ok ? (
        <Callout tone="error">{t('errors.relationshipsLoad')}</Callout>
      ) : result.data.tuples.length === 0 ? (
        <EmptyState>{t('relationships.empty')}</EmptyState>
      ) : (
        <DataTable
          head={
            <tr>
              <Th>{t('relationships.thObject')}</Th>
              <Th>{t('relationships.thRelation')}</Th>
              <Th>{t('relationships.thSubject')}</Th>
              <Th className="text-right">{t('relationships.thRev')}</Th>
              <Th className="text-right">{t('relationships.thActions')}</Th>
            </tr>
          }
        >
          {result.data.tuples.map((tuple, index) => (
            <tr
              key={`${tuple.object.type}:${tuple.object.id}-${tuple.relation}-${subjectLabel(tuple.subject)}-${index}`}
            >
              <Td>
                <span className="font-mono">{`${tuple.object.type}:${tuple.object.id}`}</span>
              </Td>
              <Td>
                <Badge>{tuple.relation}</Badge>
              </Td>
              <Td>
                <span className="font-mono text-xs">{subjectLabel(tuple.subject)}</span>
              </Td>
              <Td className="text-right tabular-nums text-muted">{tuple.revision}</Td>
              <Td className="text-right">
                <RevokeTupleButton tuple={tuple} />
              </Td>
            </tr>
          ))}
        </DataTable>
      )}
    </>
  );
}
