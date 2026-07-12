import { err, ok, type Result } from '../../shared/result';
import { isIdentifier } from './identifier';

export type NamespaceConfigError =
  | 'empty_relations'
  | 'invalid_relation'
  | 'duplicate_relation'
  | 'invalid_verb'
  | 'empty_binding'
  | 'unknown_relation';

export interface NamespaceConfigData {
  relations: string[];
  actions: Record<string, string[]>;
}

export class NamespaceConfig {
  private constructor(
    private readonly relationSet: ReadonlySet<string>,
    private readonly actionMap: ReadonlyMap<string, string[]>,
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
    return ok(new NamespaceConfig(relationSet, actionMap));
  }

  static fromData(data: NamespaceConfigData): NamespaceConfig {
    return new NamespaceConfig(new Set(data.relations), new Map(Object.entries(data.actions)));
  }

  hasRelation(relation: string): boolean {
    return this.relationSet.has(relation);
  }

  requiredRelationsForVerb(verb: string): readonly string[] {
    return this.actionMap.get(verb) ?? [];
  }

  toData(): NamespaceConfigData {
    return {
      relations: [...this.relationSet],
      actions: Object.fromEntries(this.actionMap),
    };
  }
}
