import { type CmpOp, type Condition, type Term } from './condition';
import { type EvaluationContext } from './evaluation-context';

export type Verdict = true | false | 'indeterminate';

type Resolved = number | string | boolean | Date | undefined;

function resolveTerm(term: Term, ctx: EvaluationContext): Resolved {
  if (term.kind === 'lit') return term.value;
  switch (term.path) {
    case 'principal.aal':
      return ctx.principal.aal;
    case 'env.ip':
      return ctx.env.ip;
    case 'env.now':
      return ctx.env.now;
  }
}

function toEpoch(value: Resolved): number | undefined {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string') {
    const ms = Date.parse(value);
    return Number.isNaN(ms) ? undefined : ms;
  }
  return undefined;
}

function ordered(op: CmpOp, left: number, right: number): Verdict {
  switch (op) {
    case 'eq':
      return left === right;
    case 'ne':
      return left !== right;
    case 'lt':
      return left < right;
    case 'le':
      return left <= right;
    case 'gt':
      return left > right;
    case 'ge':
      return left >= right;
  }
}

function equality(op: CmpOp, left: string | boolean, right: string | boolean): Verdict {
  switch (op) {
    case 'eq':
      return left === right;
    case 'ne':
      return left !== right;
    default:
      return 'indeterminate';
  }
}

function compare(op: CmpOp, left: Resolved, right: Resolved): Verdict {
  if (left === undefined || right === undefined) return 'indeterminate';
  if (left instanceof Date || right instanceof Date) {
    const l = toEpoch(left);
    const r = toEpoch(right);
    if (l === undefined || r === undefined) return 'indeterminate';
    return ordered(op, l, r);
  }
  if (typeof left === 'number' && typeof right === 'number') {
    return ordered(op, left, right);
  }
  if (typeof left === 'string' && typeof right === 'string') {
    return equality(op, left, right);
  }
  if (typeof left === 'boolean' && typeof right === 'boolean') {
    return equality(op, left, right);
  }
  return 'indeterminate';
}

function parseIpv4(value: string): bigint | undefined {
  const parts = value.split('.');
  if (parts.length !== 4) return undefined;
  let result = 0n;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return undefined;
    const octet = Number(part);
    if (octet > 255) return undefined;
    result = (result << 8n) | BigInt(octet);
  }
  return result;
}

function parseIpv6(value: string): bigint | undefined {
  const halves = value.split('::');
  if (halves.length > 2) return undefined;
  const parseGroups = (part: string): number[] | undefined => {
    if (part === '') return [];
    const out: number[] = [];
    for (const group of part.split(':')) {
      if (!/^[0-9a-fA-F]{1,4}$/.test(group)) return undefined;
      out.push(parseInt(group, 16));
    }
    return out;
  };
  let groups: number[];
  if (halves.length === 2) {
    const head = parseGroups(halves[0] ?? '');
    const tail = parseGroups(halves[1] ?? '');
    if (!head || !tail) return undefined;
    const fill = 8 - head.length - tail.length;
    if (fill < 1) return undefined;
    groups = [...head, ...Array<number>(fill).fill(0), ...tail];
  } else {
    const all = parseGroups(value);
    if (!all || all.length !== 8) return undefined;
    groups = all;
  }
  let result = 0n;
  for (const group of groups) result = (result << 16n) | BigInt(group);
  return result;
}

interface ParsedIp {
  readonly bits: 32 | 128;
  readonly value: bigint;
}

function parseIp(value: string): ParsedIp | undefined {
  if (value.includes(':')) {
    const parsed = parseIpv6(value);
    return parsed === undefined ? undefined : { bits: 128, value: parsed };
  }
  const parsed = parseIpv4(value);
  return parsed === undefined ? undefined : { bits: 32, value: parsed };
}

function containedIn(ip: ParsedIp, cidr: string): boolean {
  const slash = cidr.indexOf('/');
  if (slash < 0) return false;
  const base = parseIp(cidr.slice(0, slash));
  const prefix = Number(cidr.slice(slash + 1));
  if (base === undefined || base.bits !== ip.bits) return false;
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > ip.bits) return false;
  const all = (1n << BigInt(ip.bits)) - 1n;
  const mask = all ^ ((1n << BigInt(ip.bits - prefix)) - 1n);
  return (ip.value & mask) === (base.value & mask);
}

function evalIpInCidr(value: Resolved, cidrs: readonly string[]): Verdict {
  if (typeof value !== 'string') return 'indeterminate';
  const ip = parseIp(value);
  if (ip === undefined) return 'indeterminate';
  for (const cidr of cidrs) {
    if (containedIn(ip, cidr)) return true;
  }
  return false;
}

function evalIn(needle: Resolved, set: readonly (string | number)[]): Verdict {
  if (needle === undefined) return 'indeterminate';
  if (typeof needle !== 'string' && typeof needle !== 'number') return 'indeterminate';
  return set.includes(needle);
}

export function evalCondition(condition: Condition, ctx: EvaluationContext): Verdict {
  switch (condition.kind) {
    case 'and': {
      let result: Verdict = true;
      for (const child of condition.children) {
        const verdict = evalCondition(child, ctx);
        if (verdict === false) return false;
        if (verdict === 'indeterminate') result = 'indeterminate';
      }
      return result;
    }
    case 'or': {
      let result: Verdict = false;
      for (const child of condition.children) {
        const verdict = evalCondition(child, ctx);
        if (verdict === true) return true;
        if (verdict === 'indeterminate') result = 'indeterminate';
      }
      return result;
    }
    case 'not': {
      const verdict = evalCondition(condition.child, ctx);
      return verdict === 'indeterminate' ? 'indeterminate' : !verdict;
    }
    case 'cmp':
      return compare(
        condition.op,
        resolveTerm(condition.left, ctx),
        resolveTerm(condition.right, ctx),
      );
    case 'in':
      return evalIn(resolveTerm(condition.needle, ctx), condition.set);
    case 'ipInCidr':
      return evalIpInCidr(resolveTerm(condition.ip, ctx), condition.cidrs);
  }
}
