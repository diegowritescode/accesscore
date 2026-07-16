export type AttrPath = 'principal.aal' | 'env.ip' | 'env.now';

export type Term =
  | { readonly kind: 'attr'; readonly path: AttrPath }
  | { readonly kind: 'lit'; readonly value: boolean | number | string };

export type CmpOp = 'eq' | 'ne' | 'lt' | 'le' | 'gt' | 'ge';

export type Condition =
  | { readonly kind: 'and' | 'or'; readonly children: readonly Condition[] }
  | { readonly kind: 'not'; readonly child: Condition }
  | { readonly kind: 'cmp'; readonly op: CmpOp; readonly left: Term; readonly right: Term }
  | { readonly kind: 'in'; readonly needle: Term; readonly set: readonly (string | number)[] }
  | { readonly kind: 'ipInCidr'; readonly ip: Term; readonly cidrs: readonly string[] };
