import { type Decision } from '../decision';
import { type EntityRef } from '../entity-ref';

export interface BoundaryTarget {
  readonly resourceType: string;
  readonly action: string;
}

export interface PermissionBoundary {
  readonly subject: EntityRef;
  readonly allow: readonly BoundaryTarget[];
}

export interface OrgGuardrail {
  readonly allow: readonly BoundaryTarget[];
}

export interface Bounds {
  readonly boundaries: readonly PermissionBoundary[];
  readonly guardrail: OrgGuardrail | null;
}

export const UNBOUNDED: Bounds = { boundaries: [], guardrail: null };

function allows(allow: readonly BoundaryTarget[], target: BoundaryTarget): boolean {
  return allow.some(
    (entry) =>
      entry.resourceType === target.resourceType &&
      (entry.action === target.action || entry.action === '*'),
  );
}

function sameRef(a: EntityRef, b: EntityRef): boolean {
  return a.type === b.type && a.id === b.id;
}

export function applyBounds(
  decision: Decision,
  target: BoundaryTarget,
  subject: EntityRef,
  bounds: Bounds,
): Decision {
  if (decision.effect !== 'permit') {
    return decision;
  }
  if (bounds.guardrail && !allows(bounds.guardrail.allow, target)) {
    return {
      effect: 'deny',
      reasons: [
        {
          code: 'outside_org_guardrail',
          message: 'The permitted access lies outside the organization guardrail.',
        },
      ],
    };
  }
  const boundary = bounds.boundaries.find((candidate) => sameRef(candidate.subject, subject));
  if (boundary && !allows(boundary.allow, target)) {
    return {
      effect: 'deny',
      reasons: [
        {
          code: 'outside_permission_boundary',
          message: 'The permitted access lies outside the principal permission boundary.',
        },
      ],
    };
  }
  return decision;
}
