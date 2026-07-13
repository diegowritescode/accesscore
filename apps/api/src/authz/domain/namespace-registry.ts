import { type NamespaceDefinition } from './namespace-definition';
import { directUserset, type Userset } from './userset';

export class NamespaceRegistry {
  private constructor(private readonly byType: ReadonlyMap<string, NamespaceDefinition>) {}

  static of(definitions: Iterable<NamespaceDefinition>): NamespaceRegistry {
    const byType = new Map<string, NamespaceDefinition>();
    for (const definition of definitions) {
      byType.set(definition.namespace, definition);
    }
    return new NamespaceRegistry(byType);
  }

  get(type: string): NamespaceDefinition | null {
    return this.byType.get(type) ?? null;
  }

  all(): Iterable<NamespaceDefinition> {
    return this.byType.values();
  }

  rewritesFor(type: string, relation: string): Userset {
    const definition = this.byType.get(type);
    return definition ? definition.config.rewritesFor(relation) : directUserset;
  }
}
