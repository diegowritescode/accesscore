import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  DataTable,
  EmptyState,
  PageHeader,
  Section,
  StatCard,
  Td,
  Th,
} from '@/components/console/kit';
import { ArrowRightIcon } from '@/components/icons';
import { Badge, Callout } from '@/components/ui';
import { getNamespaces, getPolicies, getTuples, isUnauthorized } from '@/lib/server-directory';
import type { TupleView } from '@/lib/types';

const TUPLE_SCAN_LIMIT = 200;

function subjectLabel(subject: TupleView['subject']): string {
  const base = `${subject.type}:${subject.id}`;
  return subject.relation ? `${base}#${subject.relation}` : base;
}

export default async function OverviewPage() {
  const [namespacesResult, tuplesResult, policiesResult] = await Promise.all([
    getNamespaces(),
    getTuples(`limit=${TUPLE_SCAN_LIMIT}`),
    getPolicies(),
  ]);

  if (
    isUnauthorized(namespacesResult) ||
    isUnauthorized(tuplesResult) ||
    isUnauthorized(policiesResult)
  ) {
    redirect('/login');
  }

  const namespaces = namespacesResult.ok ? namespacesResult.data.namespaces : [];
  const tuples = tuplesResult.ok ? tuplesResult.data.tuples : [];
  const policies = policiesResult.ok ? policiesResult.data.policies : [];
  const degraded = !namespacesResult.ok || !tuplesResult.ok || !policiesResult.ok;

  const relationCount = namespaces.reduce((total, ns) => total + ns.relations.length, 0);
  const tupleCount = tuples.length >= TUPLE_SCAN_LIMIT ? `${TUPLE_SCAN_LIMIT}+` : tuples.length;

  const byObject = new Map<string, TupleView[]>();
  for (const tuple of tuples) {
    const key = `${tuple.object.type}:${tuple.object.id}`;
    const list = byObject.get(key);
    if (list) {
      list.push(tuple);
    } else {
      byObject.set(key, [tuple]);
    }
  }
  const objectGroups = [...byObject.entries()].slice(0, 6);

  return (
    <>
      <PageHeader
        title="Overview"
        description="A live, explainable authorization engine — hybrid ReBAC, RBAC and ABAC in one policy decision point. This console reads and probes the same model the API enforces."
      />

      {degraded ? (
        <Callout tone="error" className="mb-6">
          Some data could not be loaded from the authorization service. Showing what is available.
        </Callout>
      ) : null}

      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Namespaces" value={namespaces.length} hint="Resource types" />
        <StatCard label="Relations" value={relationCount} hint="Across all namespaces" />
        <StatCard label="Relationships" value={tupleCount} hint="Stored tuples" />
        <StatCard label="Policies" value={policies.length} hint="Live ABAC rules" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Section
          title="Namespaces"
          description="The resource types in this organization, with their relations and the actions each exposes."
          action={
            <Link
              href="/console/schema"
              className="inline-flex items-center gap-1 text-sm font-medium text-brand-strong hover:underline"
            >
              Schema <ArrowRightIcon className="h-4 w-4" />
            </Link>
          }
        >
          {namespaces.length === 0 ? (
            <EmptyState>No namespaces defined.</EmptyState>
          ) : (
            <DataTable
              head={
                <tr>
                  <Th>Namespace</Th>
                  <Th>Relations</Th>
                  <Th>Actions</Th>
                </tr>
              }
            >
              {namespaces.map((ns) => (
                <tr key={ns.namespace}>
                  <Td>
                    <span className="font-mono font-medium">{ns.namespace}</span>
                  </Td>
                  <Td>
                    <div className="flex flex-wrap gap-1.5">
                      {ns.relations.map((relation) => (
                        <Badge key={relation}>{relation}</Badge>
                      ))}
                    </div>
                  </Td>
                  <Td>
                    <div className="flex flex-wrap gap-1.5">
                      {ns.actions.map((action) => (
                        <Badge key={action} tone="brand">
                          {action}
                        </Badge>
                      ))}
                    </div>
                  </Td>
                </tr>
              ))}
            </DataTable>
          )}
        </Section>

        <Section title="Try it" description="Probe the graph without leaving the console.">
          <div className="flex flex-col gap-2.5">
            {[
              ['Check', 'Resolve one decision with reasons.'],
              ['Expand', 'List everyone who holds a relation.'],
              ['Simulate', 'Compare live vs. a proposed policy.'],
            ].map(([label, blurb]) => (
              <Link
                key={label}
                href="/console/playground"
                className="group flex items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3 transition-colors hover:border-line-strong hover:bg-surface-2"
              >
                <span>
                  <span className="text-sm font-semibold">{label}</span>
                  <span className="mt-0.5 block text-xs text-muted">{blurb}</span>
                </span>
                <ArrowRightIcon className="h-4 w-4 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-brand-strong" />
              </Link>
            ))}
          </div>
        </Section>
      </div>

      <Section
        className="mt-6"
        title="Seeded relationships"
        description="The relationship tuples that back the demo, grouped by object. This is the stored graph — Expand resolves it to the full member set."
        action={
          <Link
            href="/console/relationships"
            className="inline-flex items-center gap-1 text-sm font-medium text-brand-strong hover:underline"
          >
            Browse all <ArrowRightIcon className="h-4 w-4" />
          </Link>
        }
      >
        {objectGroups.length === 0 ? (
          <EmptyState>No relationships stored.</EmptyState>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {objectGroups.map(([object, group]) => (
              <div key={object} className="rounded-xl border border-line p-4">
                <div className="font-mono text-sm font-medium">{object}</div>
                <ul className="mt-3 flex flex-col gap-2">
                  {group.map((tuple, index) => (
                    <li
                      key={`${tuple.relation}-${subjectLabel(tuple.subject)}-${index}`}
                      className="flex flex-wrap items-center gap-2 text-sm"
                    >
                      <Badge>{tuple.relation}</Badge>
                      <span aria-hidden className="text-muted">
                        ←
                      </span>
                      <span className="font-mono text-xs text-fg">
                        {subjectLabel(tuple.subject)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Section>
    </>
  );
}
