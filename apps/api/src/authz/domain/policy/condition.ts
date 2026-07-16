import { err, ok, type Result } from '../../../shared/result';

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

export type ConditionError =
  | 'condition_too_deep'
  | 'too_many_condition_nodes'
  | 'empty_children'
  | 'empty_set'
  | 'mixed_set_types'
  | 'type_mismatch'
  | 'empty_cidrs'
  | 'invalid_cidr'
  | 'invalid_timestamp';

const MAX_CONDITION_DEPTH = 16;
const MAX_CONDITION_NODES = 64;

type ValueType = 'number' | 'string' | 'boolean' | 'timestamp';

const ATTR_TYPES: Record<AttrPath, ValueType> = {
  'principal.aal': 'number',
  'env.ip': 'string',
  'env.now': 'timestamp',
};

function termType(term: Term): ValueType {
  if (term.kind === 'attr') return ATTR_TYPES[term.path];
  switch (typeof term.value) {
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    default:
      return 'string';
  }
}

function temporalPair(a: ValueType, b: ValueType): boolean {
  return (
    (a === 'timestamp' && (b === 'timestamp' || b === 'string')) ||
    (b === 'timestamp' && (a === 'timestamp' || a === 'string'))
  );
}

function comparable(a: ValueType, b: ValueType): boolean {
  return a === b || temporalPair(a, b);
}

function isValidCidr(cidr: string): boolean {
  const slash = cidr.indexOf('/');
  if (slash < 0) return false;
  const addr = cidr.slice(0, slash);
  const prefixText = cidr.slice(slash + 1);
  if (!/^\d{1,3}$/.test(prefixText)) return false;
  const prefix = Number(prefixText);
  if (addr.includes(':')) {
    return prefix <= 128 && addr.length >= 2 && /^[0-9a-fA-F:]+$/.test(addr);
  }
  const octets = addr.split('.');
  if (octets.length !== 4) return false;
  if (!octets.every((octet) => /^\d{1,3}$/.test(octet) && Number(octet) <= 255)) return false;
  return prefix <= 32;
}

function checkCmp(node: Extract<Condition, { kind: 'cmp' }>): ConditionError | null {
  const left = termType(node.left);
  const right = termType(node.right);
  if (!comparable(left, right)) return 'type_mismatch';
  const ordered = node.op === 'lt' || node.op === 'le' || node.op === 'gt' || node.op === 'ge';
  if (ordered && !(left === 'number' && right === 'number') && !temporalPair(left, right)) {
    return 'type_mismatch';
  }
  const temporal = left === 'timestamp' || right === 'timestamp';
  for (const term of [node.left, node.right]) {
    if (temporal && term.kind === 'lit' && typeof term.value === 'string') {
      if (Number.isNaN(Date.parse(term.value))) return 'invalid_timestamp';
    }
  }
  return null;
}

export function parseCondition(condition: Condition): Result<Condition, ConditionError> {
  let nodes = 0;
  const walk = (node: Condition, depth: number): ConditionError | null => {
    if (depth > MAX_CONDITION_DEPTH) return 'condition_too_deep';
    nodes += 1;
    if (nodes > MAX_CONDITION_NODES) return 'too_many_condition_nodes';
    switch (node.kind) {
      case 'and':
      case 'or': {
        if (node.children.length === 0) return 'empty_children';
        for (const child of node.children) {
          const error = walk(child, depth + 1);
          if (error) return error;
        }
        return null;
      }
      case 'not':
        return walk(node.child, depth + 1);
      case 'cmp':
        return checkCmp(node);
      case 'in': {
        if (node.set.length === 0) return 'empty_set';
        const elementType = typeof node.set[0];
        if (!node.set.every((element) => typeof element === elementType)) return 'mixed_set_types';
        const needle = termType(node.needle);
        if (!comparable(needle, elementType === 'number' ? 'number' : 'string')) {
          return 'type_mismatch';
        }
        return null;
      }
      case 'ipInCidr': {
        if (termType(node.ip) !== 'string') return 'type_mismatch';
        if (node.cidrs.length === 0) return 'empty_cidrs';
        for (const cidr of node.cidrs) {
          if (!isValidCidr(cidr)) return 'invalid_cidr';
        }
        return null;
      }
    }
  };
  const error = walk(condition, 0);
  return error ? err(error) : ok(condition);
}
