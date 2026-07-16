import { type AuthTokenClaims } from '../../authn/interface/access-token.guard';
import { ProblemException } from '../../shared/http/problem-details';
import {
  type AuthzDirectoryService,
  type NamespaceDetailView,
  type TupleView,
} from '../application/directory-service';
import { DirectoryController } from './directory.controller';

const token: AuthTokenClaims = {
  sub: 'user-1',
  sid: 'sid-1',
  org: 'org-1',
  jti: 'jti-1',
  aal: 1,
  exp: 0,
};

const controllerWith = (stub: Partial<AuthzDirectoryService>): DirectoryController =>
  new DirectoryController(stub as AuthzDirectoryService);

describe('DirectoryController', () => {
  it('lists namespaces for the caller organization', async () => {
    const controller = controllerWith({
      listNamespaces: (orgId) => {
        expect(orgId.value).toBe('org-1');
        return Promise.resolve([
          { namespace: 'document', relations: ['viewer'], actions: ['read'], revision: 1 },
        ]);
      },
    });

    const response = await controller.namespaces(token);

    expect(response.namespaces).toHaveLength(1);
    expect(response.namespaces[0]?.namespace).toBe('document');
  });

  it('returns the namespace detail', async () => {
    const detail: NamespaceDetailView = {
      namespace: 'document',
      relations: ['viewer'],
      actions: { read: ['viewer'] },
      rewrites: {},
      revision: 1,
    };
    const controller = controllerWith({ getNamespace: () => Promise.resolve(detail) });

    expect(await controller.namespace(token, 'document')).toBe(detail);
  });

  it('maps a missing namespace to a 404 problem', async () => {
    const controller = controllerWith({ getNamespace: () => Promise.resolve(null) });

    await expect(controller.namespace(token, 'folder')).rejects.toBeInstanceOf(ProblemException);
  });

  it('fails a namespace read closed with a 503 problem when the directory errors', async () => {
    const controller = controllerWith({
      getNamespace: () => Promise.reject(new Error('store down')),
    });

    await expect(controller.namespace(token, 'document')).rejects.toBeInstanceOf(ProblemException);
  });

  it('parses the tuple query, forwards filters and returns the tuples', async () => {
    const tuples: TupleView[] = [
      {
        object: { type: 'document', id: 'onboarding' },
        relation: 'viewer',
        subject: { type: 'user', id: 'bob' },
        revision: 3,
      },
    ];
    let received: unknown;
    const controller = controllerWith({
      listTuples: (_orgId, query) => {
        received = query;
        return Promise.resolve(tuples);
      },
    });

    const response = await controller.tuples(token, {
      namespace: 'document',
      relation: 'viewer',
      subjectType: 'group',
      subjectId: 'eng',
      subjectRelation: 'member',
      limit: '25',
      offset: '5',
    });

    expect(response.tuples).toBe(tuples);
    expect(received).toEqual({
      namespace: 'document',
      objectId: undefined,
      relation: 'viewer',
      subject: { type: 'group', id: 'eng', relation: 'member' },
      limit: 25,
      offset: 5,
    });
  });

  it('applies default pagination when omitted', async () => {
    let received: { limit: number; offset: number } | undefined;
    const controller = controllerWith({
      listTuples: (_orgId, query) => {
        received = query;
        return Promise.resolve([]);
      },
    });

    await controller.tuples(token, {});

    expect(received).toMatchObject({ limit: 50, offset: 0, subject: undefined });
  });

  it('rejects a tuple query with a half-specified subject as a 400 problem', async () => {
    const controller = controllerWith({ listTuples: () => Promise.resolve([]) });

    await expect(controller.tuples(token, { subjectType: 'user' })).rejects.toBeInstanceOf(
      ProblemException,
    );
  });

  it('lists policies for the caller organization', async () => {
    const controller = controllerWith({
      listPolicies: () =>
        Promise.resolve([
          {
            id: 'p1',
            effect: 'forbid',
            resourceType: 'document',
            action: 'read',
            condition: {
              kind: 'cmp',
              op: 'ge',
              left: { kind: 'attr', path: 'principal.aal' },
              right: { kind: 'lit', value: 1 },
            },
            revision: 2,
          },
        ]),
    });

    const response = await controller.policies(token);

    expect(response.policies[0]?.id).toBe('p1');
  });

  it('fails a namespace list closed with a 503 problem when the directory errors', async () => {
    const controller = controllerWith({
      listNamespaces: () => Promise.reject(new Error('store down')),
    });

    await expect(controller.namespaces(token)).rejects.toBeInstanceOf(ProblemException);
  });

  it('fails a tuple browse closed with a 503 problem when the directory errors', async () => {
    const controller = controllerWith({
      listTuples: () => Promise.reject(new Error('store down')),
    });

    await expect(controller.tuples(token, {})).rejects.toBeInstanceOf(ProblemException);
  });

  it('fails a policy list closed with a 503 problem when the directory errors', async () => {
    const controller = controllerWith({
      listPolicies: () => Promise.reject(new Error('store down')),
    });

    await expect(controller.policies(token)).rejects.toBeInstanceOf(ProblemException);
  });

  it('rejects a caller with no organization as a 400 problem', async () => {
    const controller = controllerWith({ listNamespaces: () => Promise.resolve([]) });

    await expect(controller.namespaces({ ...token, org: null })).rejects.toBeInstanceOf(
      ProblemException,
    );
  });
});
