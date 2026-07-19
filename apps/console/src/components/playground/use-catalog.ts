'use client';

import { useEffect, useMemo, useState } from 'react';
import { fetchNamespaces, fetchTuples } from '@/lib/client';
import type { NamespaceSummary, TupleView } from '@/lib/types';

const TUPLE_SCAN_LIMIT = 200;

export interface Catalog {
  loading: boolean;
  unauthorized: boolean;
  namespaces: NamespaceSummary[];
  tuples: TupleView[];
  namespaceNames: string[];
  resourceTypes: string[];
  subjects: string[];
  actionsFor: (type: string) => string[];
  relationsFor: (type: string) => string[];
  objectIdsFor: (type: string) => string[];
}

function sorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

export function useCatalog(): Catalog {
  const [namespaces, setNamespaces] = useState<NamespaceSummary[]>([]);
  const [tuples, setTuples] = useState<TupleView[]>([]);
  const [loading, setLoading] = useState(true);
  const [unauthorized, setUnauthorized] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      const [namespacesResult, tuplesResult] = await Promise.all([
        fetchNamespaces(),
        fetchTuples(`limit=${TUPLE_SCAN_LIMIT}`),
      ]);
      if (!active) {
        return;
      }
      if (namespacesResult.status === 'unauthorized' || tuplesResult.status === 'unauthorized') {
        setUnauthorized(true);
      }
      if (namespacesResult.status === 'ok') {
        setNamespaces(namespacesResult.data.namespaces);
      }
      if (tuplesResult.status === 'ok') {
        setTuples(tuplesResult.data.tuples);
      }
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  return useMemo(() => {
    const nsByType = new Map(namespaces.map((ns) => [ns.namespace, ns]));

    const objectTypes = sorted([
      ...namespaces.map((ns) => ns.namespace),
      ...tuples.map((tuple) => tuple.object.type),
    ]);

    const subjects = sorted(
      tuples
        .filter((tuple) => tuple.subject.relation === undefined)
        .map((tuple) => `${tuple.subject.type}:${tuple.subject.id}`),
    );

    const objectIdsFor = (type: string): string[] =>
      sorted(tuples.filter((tuple) => tuple.object.type === type).map((tuple) => tuple.object.id));

    const relationsFor = (type: string): string[] => {
      const declared = nsByType.get(type)?.relations ?? [];
      const observed = tuples
        .filter((tuple) => tuple.object.type === type)
        .map((tuple) => tuple.relation);
      return sorted([...declared, ...observed]);
    };

    const actionsFor = (type: string): string[] => sorted(nsByType.get(type)?.actions ?? []);

    return {
      loading,
      unauthorized,
      namespaces,
      tuples,
      namespaceNames: sorted(namespaces.map((ns) => ns.namespace)),
      resourceTypes: objectTypes,
      subjects,
      actionsFor,
      relationsFor,
      objectIdsFor,
    };
  }, [namespaces, tuples, loading, unauthorized]);
}
