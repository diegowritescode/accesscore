export type Userset =
  | { readonly kind: 'this' }
  | { readonly kind: 'computedUserset'; readonly relation: string }
  | {
      readonly kind: 'tupleToUserset';
      readonly tupleset: string;
      readonly computedUserset: string;
    }
  | { readonly kind: 'union'; readonly children: readonly Userset[] };

export const directUserset: Userset = { kind: 'this' };

export function computedUsersetTargets(userset: Userset): string[] {
  switch (userset.kind) {
    case 'this':
    case 'tupleToUserset':
      return [];
    case 'computedUserset':
      return [userset.relation];
    case 'union':
      return userset.children.flatMap(computedUsersetTargets);
  }
}
