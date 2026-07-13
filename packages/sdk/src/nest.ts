import { REASON_CODES, type ResourceRef } from '@accesscore/contracts';
import {
  applyDecorators,
  type CanActivate,
  type DynamicModule,
  type ExecutionContext,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Module,
  SetMetadata,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type AccessCoreClient, type AccessCoreClientConfig, createClient } from './client';

export const ACCESS_CORE_CLIENT = Symbol('ACCESS_CORE_CLIENT');
const REQUIRE_PERMISSION = Symbol('accesscore:require-permission');

export interface PepRequest {
  readonly headers: Record<string, string | string[] | undefined>;
  readonly params: Record<string, string | undefined>;
}

export type ResourceResolver = (request: PepRequest) => ResourceRef;
export type ConsistencyResolver = (request: PepRequest) => string | undefined;

interface RequiredPermission {
  readonly action: string;
  readonly resource: ResourceResolver;
  readonly consistency?: ConsistencyResolver;
}

export function resourceFromParam(type: string, param: string): ResourceResolver {
  return (request) => {
    const value = request.params[param];
    return { type, id: typeof value === 'string' ? value : '' };
  };
}

function bearer(header: string | string[] | undefined): string | null {
  const value = Array.isArray(header) ? header[0] : header;
  if (!value || !value.startsWith('Bearer ')) {
    return null;
  }
  return value.slice('Bearer '.length).trim();
}

@Injectable()
export class AccessCorePermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(ACCESS_CORE_CLIENT) private readonly client: AccessCoreClient,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.get<RequiredPermission | undefined>(
      REQUIRE_PERMISSION,
      context.getHandler(),
    );
    if (!required) {
      return true;
    }

    const request = context.switchToHttp().getRequest<PepRequest>();
    const token = bearer(request.headers.authorization);
    if (!token) {
      throw new UnauthorizedException();
    }

    const decision = await this.client.check(required.action, required.resource(request), {
      token,
      consistencyToken: required.consistency?.(request),
    });

    if (decision.effect === 'permit') {
      return true;
    }

    const code = decision.reasons[0]?.code;
    if (code === REASON_CODES.UNAUTHENTICATED) {
      throw new UnauthorizedException();
    }
    if (code === REASON_CODES.PDP_UNAVAILABLE) {
      throw new HttpException('Authorization service unavailable', HttpStatus.SERVICE_UNAVAILABLE);
    }
    throw new ForbiddenException();
  }
}

export function RequirePermission(
  action: string,
  resource: ResourceResolver,
  consistency?: ConsistencyResolver,
): ReturnType<typeof applyDecorators> {
  return applyDecorators(
    SetMetadata<symbol, RequiredPermission>(REQUIRE_PERMISSION, { action, resource, consistency }),
    UseGuards(AccessCorePermissionGuard),
  );
}

@Module({})
export class AccessCoreModule {
  static forRoot(config: AccessCoreClientConfig): DynamicModule {
    return {
      module: AccessCoreModule,
      providers: [
        { provide: ACCESS_CORE_CLIENT, useValue: createClient(config) },
        AccessCorePermissionGuard,
      ],
      exports: [ACCESS_CORE_CLIENT, AccessCorePermissionGuard],
    };
  }
}
