import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import {
  NAMESPACE_CONFIG_WRITER,
  type NamespaceConfigWriter,
} from './authz/application/namespace-config-writer';
import {
  RELATION_TUPLE_WRITER,
  type RelationTupleWriter,
} from './authz/application/relation-tuple-writer';
import { type EntityRef } from './authz/domain/entity-ref';
import { type SubjectRef } from './authz/domain/subject-ref';
import { type Userset } from './authz/domain/userset';
import { HASHER, type Hasher } from './identity/domain/ports/hasher';
import { USERS_REPOSITORY, type UsersRepository } from './identity/domain/ports/users-repository';
import { User } from './identity/domain/user';
import { Email } from './identity/domain/value-objects/email';
import { Password } from './identity/domain/value-objects/password';
import { CLOCK, type Clock } from './shared/kernel/clock';
import { UserId } from './shared/kernel/user-id';
import { TENANCY_SERVICE, type TenancyService } from './tenancy/application/tenancy-service';

const DEMO_EMAIL = 'demo@accesscore.dev';
const DEMO_PASSWORD = 'correct horse battery staple';

const object = (type: string, id: string): EntityRef => ({ type, id });
const asSubject = (type: string, id: string): SubjectRef => ({
  kind: 'subject',
  ref: object(type, id),
});
const asUserset = (type: string, id: string, relation: string): SubjectRef => ({
  kind: 'userset',
  ref: object(type, id),
  relation,
});

const editorRewrite: Userset = {
  kind: 'union',
  children: [{ kind: 'this' }, { kind: 'computedUserset', relation: 'owner' }],
};

const viewerRewrite: Userset = {
  kind: 'union',
  children: [
    { kind: 'this' },
    { kind: 'computedUserset', relation: 'editor' },
    { kind: 'tupleToUserset', tupleset: 'parent', computedUserset: 'viewer' },
  ],
};

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  try {
    const clock = app.get<Clock>(CLOCK);
    const users = app.get<UsersRepository>(USERS_REPOSITORY);
    const hasher = app.get<Hasher>(HASHER);
    const tenancy = app.get<TenancyService>(TENANCY_SERVICE);
    const namespaces = app.get<NamespaceConfigWriter>(NAMESPACE_CONFIG_WRITER);
    const tuples = app.get<RelationTupleWriter>(RELATION_TUPLE_WRITER);

    const email = Email.create(DEMO_EMAIL);
    if (!email.ok) {
      throw new Error('invalid demo email');
    }

    const existing = await users.findByEmail(email.value);
    if (existing && (await tenancy.findActiveOrganization(existing.id))) {
      process.stdout.write(`Seed already applied. Demo login: ${DEMO_EMAIL} / ${DEMO_PASSWORD}\n`);
      return;
    }

    const now = clock.now();
    let userId: UserId;
    if (existing) {
      userId = existing.id;
    } else {
      const password = Password.create(DEMO_PASSWORD);
      if (!password.ok) {
        throw new Error('invalid demo password');
      }
      const passwordHash = await hasher.hash(password.value);
      const user = User.register({ id: UserId.generate(), email: email.value, passwordHash, now });
      user.verifyEmail(now);
      await users.save(user);
      userId = user.id;
    }

    const orgId = await tenancy.provisionPersonalOrganization(userId);

    const defined = await namespaces.define({
      orgId,
      namespace: 'document',
      config: {
        relations: ['owner', 'editor', 'viewer', 'parent'],
        actions: { read: ['viewer'], write: ['editor'] },
        rewrites: { editor: editorRewrite, viewer: viewerRewrite },
      },
    });
    if (!defined.ok) {
      throw new Error(`failed to define namespace: ${defined.error}`);
    }

    const grants: Array<{ object: EntityRef; relation: string; subject: SubjectRef }> = [
      {
        object: object('document', 'onboarding'),
        relation: 'owner',
        subject: asSubject('user', userId.value),
      },
      {
        object: object('document', 'onboarding'),
        relation: 'viewer',
        subject: asUserset('group', 'eng', 'member'),
      },
      {
        object: object('group', 'eng'),
        relation: 'member',
        subject: asUserset('group', 'eng-leads', 'member'),
      },
      {
        object: object('group', 'eng-leads'),
        relation: 'member',
        subject: asSubject('user', 'bob'),
      },
      {
        object: object('document', 'onboarding'),
        relation: 'parent',
        subject: asSubject('folder', 'handbook'),
      },
      {
        object: object('folder', 'handbook'),
        relation: 'viewer',
        subject: asSubject('user', 'carol'),
      },
    ];
    for (const grant of grants) {
      await tuples.write({ orgId, ...grant });
    }

    process.stdout.write(
      [
        'Seed applied.',
        `  org:        ${orgId.value}`,
        `  demo login: ${DEMO_EMAIL} / ${DEMO_PASSWORD}  (owner of document:onboarding)`,
        '  showcase:   POST /authz/expand { resource: { type: "document", id: "onboarding" }, relation: "viewer" }',
        '              resolves the owner (you, via owner->editor->viewer), user:bob (nested group eng-leads<eng),',
        '              and user:carol (inherited from folder:handbook via tuple_to_userset).',
        '',
      ].join('\n'),
    );
  } finally {
    await app.close();
  }
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
