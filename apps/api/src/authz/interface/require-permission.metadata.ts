import { type AuthenticatedRequest } from '../../authn/interface/access-token.guard';
import { type EntityRef } from '../domain/entity-ref';

export const REQUIRE_PERMISSION = 'authz:require-permission';

export type ResourceResolver = (request: AuthenticatedRequest) => EntityRef;

export interface RequiredPermission {
  readonly action: string;
  readonly resource: ResourceResolver;
}

export function resourceFromParam(type: string, param: string): ResourceResolver {
  return (request) => {
    const value = request.params[param];
    return { type, id: typeof value === 'string' ? value : '' };
  };
}
