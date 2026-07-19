import { redirect } from 'next/navigation';
import { EmptyState, PageHeader, Section } from '@/components/console/kit';
import { Badge, Callout } from '@/components/ui';
import { getPolicies, isUnauthorized } from '@/lib/server-directory';

export default async function PoliciesPage() {
  const result = await getPolicies();
  if (isUnauthorized(result)) {
    redirect('/login');
  }

  return (
    <>
      <PageHeader
        title="Policies"
        description="The live ABAC policies. Each targets a resource type and action, carries a permit or forbid effect, and gates on a condition over principal and environment attributes. Forbid always wins (deny-override)."
      />

      {!result.ok ? (
        <Callout tone="error">Policies could not be loaded from the authorization service.</Callout>
      ) : result.data.policies.length === 0 ? (
        <EmptyState>
          No ABAC policies are defined. Decisions fall back to the relationship graph.
        </EmptyState>
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
                <Badge tone={policy.effect === 'forbid' ? 'deny' : 'permit'}>{policy.effect}</Badge>
              }
            >
              <div>
                <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
                  Condition
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
