import { type AppendedRecord, type AuditEvent, type ChainVerification } from '../audit-event';

export interface AuditLog {
  append(event: AuditEvent): Promise<AppendedRecord>;
  verify(): Promise<ChainVerification>;
}

export const AUDIT_LOG = Symbol('AUDIT_LOG');
