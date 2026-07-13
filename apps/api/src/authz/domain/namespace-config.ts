import { err, ok, type Result } from '../../shared/result';
import { isIdentifier } from './identifier';
import { computedUsersetTargets, directUserset, type Userset } from './userset';

export type NamespaceConfigError =
  | 'empty_relations'
  | 'invalid_relation'
  | 'duplicate_relation'
  | 'invalid_verb'
  | 'empty_binding'
  | 'unknown_relation'
  | 'unknown_rewrite_relation'
  | 'invalid_rewrite'
  | 'rewrite_too_deep'
  | 'cyclic_computed_userset';

const MAX_REWRITE_DEPTH = 32;

export interface NamespaceConfigData {
  relations: string[];
  actions: Record<string, string[]>;
  rewrites?: Record<string, Userset>;
}

function validateUserset(
  node: Userset,
  relations: ReadonlySet<string>,
  depth = 0,
): Result<void, NamespaceConfigError> {
  if (depth > MAX_REWRITE_DEPTH) {
    return err('rewrite_too_deep');
  }
  switch (node.kind) {
    case 'this':
      return ok(undefined);
    case 'computedUserset':
      if (!isIdentifier(node.relation)) return err('invalid_rewrite');
      if (!relations.has(node.relation)) return err('unknown_rewrite_relation');
      return ok(undefined);
    case 'tupleToUserset':
      if (!isIdentifier(node.tupleset) || !isIdentifier(node.computedUserset)) {
        return err('invalid_rewrite');
      }
      if (!relations.has(node.tupleset)) return err('unknown_rewrite_relation');
      return ok(undefined);
    case 'union':
      if (node.children.length === 0) return err('invalid_rewrite');
      for (const child of node.children) {
        const result = validateUserset(child, relations, depth + 1);
        if (!result.ok) return result;
      }
      return ok(undefined);
  }
}

function hasComputedUsersetCycle(edges: ReadonlyMap<string, readonly string[]>): boolean {
  const visiting = new Set<string>();
  const done = new Set<string>();

  const walk = (relation: string): boolean => {
    if (visiting.has(relation)) return true;
    if (done.has(relation)) return false;
    visiting.add(relation);
    for (const target of edges.get(relation) ?? []) {
      if (walk(target)) return true;
    }
    visiting.delete(relation);
    done.add(relation);
    return false;
  };

  for (const relation of edges.keys()) {
    if (walk(relation)) return true;
  }
  return false;
}

export class NamespaceConfig {
  private constructor(
    private readonly relationSet: ReadonlySet<string>,
    private readonly actionMap: ReadonlyMap<string, string[]>,
    private readonly rewriteMap: ReadonlyMap<string, Userset>,
  ) {}

  static create(data: NamespaceConfigData): Result<NamespaceConfig, NamespaceConfigError> {
    if (data.relations.length === 0) {
      return err('empty_relations');
    }
    const relationSet = new Set<string>();
    for (const relation of data.relations) {
      if (!isIdentifier(relation)) return err('invalid_relation');
      if (relationSet.has(relation)) return err('duplicate_relation');
      relationSet.add(relation);
    }
    const actionMap = new Map<string, string[]>();
    for (const [verb, relations] of Object.entries(data.actions)) {
      if (!isIdentifier(verb)) return err('invalid_verb');
      if (relations.length === 0) return err('empty_binding');
      for (const relation of relations) {
        if (!relationSet.has(relation)) return err('unknown_relation');
      }
      actionMap.set(verb, [...new Set(relations)]);
    }
    const rewriteMap = new Map<string, Userset>();
    const computedEdges = new Map<string, readonly string[]>();
    for (const [relation, tree] of Object.entries(data.rewrites ?? {})) {
      if (!relationSet.has(relation)) return err('unknown_rewrite_relation');
      const validated = validateUserset(tree, relationSet);
      if (!validated.ok) return validated;
      computedEdges.set(relation, computedUsersetTargets(tree));
      rewriteMap.set(relation, tree);
    }
    if (hasComputedUsersetCycle(computedEdges)) {
      return err('cyclic_computed_userset');
    }
    return ok(new NamespaceConfig(relationSet, actionMap, rewriteMap));
  }

  static fromData(data: NamespaceConfigData): NamespaceConfig {
    return new NamespaceConfig(
      new Set(data.relations),
      new Map(Object.entries(data.actions)),
      new Map(Object.entries(data.rewrites ?? {})),
    );
  }

  hasRelation(relation: string): boolean {
    return this.relationSet.has(relation);
  }

  requiredRelationsForVerb(verb: string): readonly string[] {
    return this.actionMap.get(verb) ?? [];
  }

  rewritesFor(relation: string): Userset {
    return this.rewriteMap.get(relation) ?? directUserset;
  }

  toData(): NamespaceConfigData {
    const data: NamespaceConfigData = {
      relations: [...this.relationSet],
      actions: Object.fromEntries(this.actionMap),
    };
    if (this.rewriteMap.size > 0) {
      data.rewrites = Object.fromEntries(this.rewriteMap);
    }
    return data;
  }
}
