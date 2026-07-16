import { redirect } from 'next/navigation';
import { DataTable, EmptyState, PageHeader, Td, Th } from '@/components/console/kit';
import { Badge, Callout } from '@/components/ui';
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

  return (
    <>
      <PageHeader
        title="Relationships"
        description="The stored relationship tuples — object, relation and subject. This is the raw graph the engine walks; a userset subject (type:id#relation) points at another set. Use Expand in the Playground to resolve a relation to its full member set."
      />

      {!result.ok ? (
        <Callout tone="error">
          Relationships could not be loaded from the authorization service.
        </Callout>
      ) : result.data.tuples.length === 0 ? (
        <EmptyState>No relationship tuples are stored in this organization.</EmptyState>
      ) : (
        <DataTable
          head={
            <tr>
              <Th>Object</Th>
              <Th>Relation</Th>
              <Th>Subject</Th>
              <Th className="text-right">Rev</Th>
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
