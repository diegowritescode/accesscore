import { cookies } from 'next/headers';
import { AC_TOKEN_COOKIE, callAccessCore } from './accesscore';
import type {
  ChainVerification,
  MfaStatus,
  NamespaceDetail,
  NamespaceSummary,
  PolicyView,
  TupleView,
} from './types';

export type DirectoryResult<T> = { ok: true; data: T } | { ok: false; status: number };

export function isUnauthorized(result: DirectoryResult<unknown>): boolean {
  return !result.ok && result.status === 401;
}

async function get<T>(path: string): Promise<DirectoryResult<T>> {
  const store = await cookies();
  const token = store.get(AC_TOKEN_COOKIE)?.value;
  if (!token) {
    return { ok: false, status: 401 };
  }
  try {
    const response = await callAccessCore(path, { method: 'GET', token });
    if (response.status !== 200) {
      return { ok: false, status: response.status };
    }
    return { ok: true, data: response.body as T };
  } catch {
    return { ok: false, status: 503 };
  }
}

export function getNamespaces(): Promise<DirectoryResult<{ namespaces: NamespaceSummary[] }>> {
  return get('/authz/namespaces');
}

export function getNamespace(namespace: string): Promise<DirectoryResult<NamespaceDetail>> {
  return get(`/authz/namespaces/${encodeURIComponent(namespace)}`);
}

export function getTuples(query = ''): Promise<DirectoryResult<{ tuples: TupleView[] }>> {
  return get(`/authz/tuples${query ? `?${query}` : ''}`);
}

export function getPolicies(): Promise<DirectoryResult<{ policies: PolicyView[] }>> {
  return get('/authz/policies');
}

export function getMfaStatus(): Promise<DirectoryResult<MfaStatus>> {
  return get('/auth/mfa/status');
}

export function getAuditVerification(): Promise<DirectoryResult<ChainVerification>> {
  return get('/authz/audit/verify');
}
