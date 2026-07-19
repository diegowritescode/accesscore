import { redirect } from 'next/navigation';
import { DataTable, EmptyState, PageHeader, Td, Th } from '@/components/console/kit';
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
            </tr>
          ))}
        </DataTable>
      )}
    </>
  );
}
