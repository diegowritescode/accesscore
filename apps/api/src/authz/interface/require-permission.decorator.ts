import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';
import { AccessTokenGuard } from '../../authn/interface/access-token.guard';
import { PermissionGuard } from './permission.guard';
import {
  REQUIRE_PERMISSION,
  type RequiredPermission,
  type ResourceResolver,
} from './require-permission.metadata';

export { resourceFromParam } from './require-permission.metadata';

export function RequirePermission(
  action: string,
  resource: ResourceResolver,
): ReturnType<typeof applyDecorators> {
  return applyDecorators(
    SetMetadata<string, RequiredPermission>(REQUIRE_PERMISSION, { action, resource }),
    UseGuards(AccessTokenGuard, PermissionGuard),
  );
}
