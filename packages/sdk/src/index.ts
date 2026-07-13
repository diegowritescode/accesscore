export {
  type CheckRequest,
  type Decision,
  type Effect,
  type Reason,
  type ReasonCode,
  REASON_CODES,
  type ResourceRef,
} from '@accesscore/contracts';
export {
  type AccessCoreClient,
  type AccessCoreClientConfig,
  type CheckOptions,
  createClient,
} from './client';
export {
  ACCESS_CORE_CLIENT,
  AccessCoreModule,
  AccessCorePermissionGuard,
  type ConsistencyResolver,
  type PepRequest,
  RequirePermission,
  resourceFromParam,
  type ResourceResolver,
} from './nest';
