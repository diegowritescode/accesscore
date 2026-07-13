import { type Decision, REASON_CODES, type ResourceRef } from '@accesscore/contracts';

export interface AccessCoreClientConfig {
  readonly baseUrl: string;
  readonly timeoutMs?: number;
  readonly fetch?: typeof fetch;
}

export interface CheckOptions {
  readonly token: string;
  readonly consistencyToken?: string;
}

export interface AccessCoreClient {
  check(action: string, resource: ResourceRef, options: CheckOptions): Promise<Decision>;
}

const DEFAULT_TIMEOUT_MS = 5000;

function deny(code: string, message: string): Decision {
  return { effect: 'deny', reasons: [{ code, message }] };
}

export function createClient(config: AccessCoreClientConfig): AccessCoreClient {
  const fetchImpl = config.fetch ?? fetch;
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const endpoint = `${config.baseUrl.replace(/\/+$/, '')}/authz/check`;

  return {
    async check(action, resource, options): Promise<Decision> {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      let response: Response;
      try {
        response = await fetchImpl(endpoint, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${options.token}`,
          },
          body: JSON.stringify({
            action,
            resource,
            consistency_token: options.consistencyToken,
          }),
          signal: controller.signal,
        });
      } catch {
        return deny(REASON_CODES.PDP_UNAVAILABLE, 'AccessCore did not respond.');
      } finally {
        clearTimeout(timer);
      }

      if (response.status === 401) {
        return deny(REASON_CODES.UNAUTHENTICATED, 'The forwarded access token was rejected.');
      }
      if (!response.ok) {
        return deny(REASON_CODES.PDP_UNAVAILABLE, `AccessCore returned status ${response.status}.`);
      }

      try {
        const body = (await response.json()) as Decision;
        if (body.effect !== 'permit' && body.effect !== 'deny') {
          return deny(
            REASON_CODES.PDP_UNAVAILABLE,
            'AccessCore returned an unrecognized decision.',
          );
        }
        return body;
      } catch {
        return deny(REASON_CODES.PDP_UNAVAILABLE, 'AccessCore returned an unparseable response.');
      }
    },
  };
}
