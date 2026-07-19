export interface AuditEvent {
  type: string;
  orgId: string | null;
  subject: string | null;
  payload: Record<string, unknown>;
}

export interface AppendedRecord {
  seq: number;
  hash: string;
}

export interface ChainVerification {
  ok: boolean;
  length: number;
  brokenAt: number | null;
}
