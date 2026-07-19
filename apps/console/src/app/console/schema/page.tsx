import { redirect } from 'next/navigation';
import { EmptyState, PageHeader, Section } from '@/components/console/kit';
import { Badge, Callout } from '@/components/ui';
import { getT } from '@/lib/i18n-server';
import { getNamespace, getNamespaces, isUnauthorized } from '@/lib/server-directory';
import type { NamespaceDetail } from '@/lib/types';

export default async function SchemaPage() {
  const namespacesResult = await getNamespaces();
  if (isUnauthorized(namespacesResult)) {
    redirect('/login');
  }
  const t = await getT();
  if (!namespacesResult.ok) {
    return (
      <>
        <PageHeader title={t('schema.title')} />
        <Callout tone="error">{t('errors.schemaLoad')}</Callout>
      </>
    );
  }

  const summaries = namespacesResult.data.namespaces;
  const details = await Promise.all(summaries.map((ns) => getNamespace(ns.namespace)));
  const namespaces = details
    .map((result) => (result.ok ? result.data : null))
    .filter((detail): detail is NamespaceDetail => detail !== null);

  return (
    <>
      <PageHeader title={t('schema.title')} description={t('schema.description')} />

      {namespaces.length === 0 ? (
        <EmptyState>{t('schema.empty')}</EmptyState>
      ) : (
        <div className="flex flex-col gap-6">
          {namespaces.map((ns) => {
            const rewrites = Object.entries(ns.rewrites);
            return (
              <Section
                key={ns.namespace}
                title={ns.namespace}
                description={t('schema.revision', { revision: ns.revision })}
              >
                <div className="flex flex-col gap-6">
                  <div>
                    <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
                      {t('schema.relations')}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {ns.relations.map((relation) => (
                        <Badge key={relation}>{relation}</Badge>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
                      {t('schema.actions')}
                    </div>
                    <div className="flex flex-col gap-2">
                      {Object.entries(ns.actions).map(([verb, relations]) => (
                        <div key={verb} className="flex flex-wrap items-center gap-2 text-sm">
                          <Badge tone="brand">{verb}</Badge>
                          <span aria-hidden className="text-muted">
                            {t('schema.requires')}
                          </span>
                          {relations.map((relation) => (
                            <Badge key={relation}>{relation}</Badge>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
                      {t('schema.rewrites')}
                    </div>
                    {rewrites.length === 0 ? (
                      <p className="text-sm text-muted">{t('schema.noRewrites')}</p>
                    ) : (
                      <div className="flex flex-col gap-3">
                        {rewrites.map(([relation, tree]) => (
                          <div key={relation} className="rounded-xl border border-line p-3">
                            <div className="mb-2 flex items-center gap-2 text-sm">
                              <Badge>{relation}</Badge>
                              <span aria-hidden className="text-muted">
                                ⇐
                              </span>
                            </div>
                            <pre className="overflow-x-auto rounded-lg bg-surface-2 p-3 font-mono text-xs leading-relaxed text-fg">
                              {JSON.stringify(tree, null, 2)}
                            </pre>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </Section>
            );
          })}
        </div>
      )}
    </>
  );
}
