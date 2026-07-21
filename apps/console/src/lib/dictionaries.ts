type Dict = Record<string, string>;

const en: Dict = {
  'common.signedIn': 'Signed in',
  'common.logout': 'Log out',
  'common.signingOut': 'Signing out…',
  'common.apiReference': 'API reference',
  'common.backHome': '← Back to home',
  'common.language': 'Language',
  'common.cancel': 'Cancel',

  'nav.overview': 'Overview',
  'nav.schema': 'Schema',
  'nav.relationships': 'Relationships',
  'nav.playground': 'Playground',
  'nav.policies': 'Policies',
  'nav.security': 'Security',

  'brand.suffix': 'Console',

  'field.resourceType': 'Resource type',
  'field.resourceId': 'Resource id',
  'field.resourceIdHint': 'The specific object instance.',
  'field.action': 'Action',
  'field.sentAs': 'Sent as {action}',

  'errors.unavailable': 'Authorization service unavailable. Please try again shortly.',
  'errors.degraded':
    'Some data could not be loaded from the authorization service. Showing what is available.',
  'errors.schemaLoad': 'The schema could not be loaded from the authorization service.',
  'errors.relationshipsLoad': 'Relationships could not be loaded from the authorization service.',
  'errors.policiesLoad': 'Policies could not be loaded from the authorization service.',
  'errors.invalidCredentials': 'Invalid credentials. Check the email and password and try again.',
  'errors.loginUnavailable': 'Authorization service unavailable. Please try again in a moment.',

  'reauth.expired': 'Your session has expired. Log in again to continue.',
  'reauth.loginAgain': 'Log in again',

  'landing.badge': 'Identity & Access Management',
  'landing.title': 'A live, explainable authorization engine.',
  'landing.subtitle':
    'AccessCore decides who can do what — and shows its work. Hybrid ReBAC, RBAC, and ABAC in a single policy decision point: relationship graphs, roles, and attribute conditions resolved in one call.',
  'landing.openConsole': 'Open the console',
  'landing.readApi': 'Read the API reference',
  'landing.demoNote':
    'A portfolio demo backed by a live API. Sign in with the seeded demo account — credentials are prefilled on the sign-in page.',
  'landing.featureCheckTitle': 'Check',
  'landing.featureCheckBody':
    'Ask one question — can this subject perform this action on this resource? Get permit or deny back, with an explainable trail of reason codes.',
  'landing.featureExpandTitle': 'Expand',
  'landing.featureExpandBody':
    'Walk the relationship graph the other way. List every subject that resolves into a relation across role aliases, nested groups, and hierarchy.',
  'landing.featureSimulateTitle': 'Simulate',
  'landing.featureSimulateBody':
    'Preview a policy change before shipping it. Compare the live decision against a proposed policy overlay, side by side, with a changed flag.',
  'landing.modelsTitle': 'One engine, three models',
  'landing.modelsBody':
    'Most systems bolt these together. AccessCore resolves them in a single evaluation and returns the reasons behind every decision.',
  'landing.rebacDesc':
    'Zanzibar-style relationship tuples with computed and tuple-to-userset rewrites.',
  'landing.rbacDesc': 'Roles modelled as relations and resolved through the same graph.',
  'landing.abacDesc':
    'Attribute conditions on the principal and environment, evaluated per request.',
  'landing.consistencyTerm': 'Consistency',
  'landing.consistencyDesc': 'Optional zookie tokens for read-your-writes freshness guarantees.',
  'landing.tokenSafeTitle': 'Token-safe by design',
  'landing.tokenSafeBody':
    'This console is a backend-for-frontend. The browser never touches an access token — the Next.js server holds the session in an httpOnly cookie and proxies every authorization call to the AccessCore API server-side.',
  'landing.footer': 'AccessCore — portfolio demo.',
  'landing.openConsoleShort': 'Open console',

  'login.title': 'Sign in to the Console',
  'login.subtitle':
    'The demo account is prefilled. It owns {resource} and can use every console view.',
  'login.email': 'Email',
  'login.password': 'Password',
  'login.resetDemo': 'Reset to demo',
  'login.submit': 'Log in',

  'overview.title': 'Overview',
  'overview.description':
    'A live, explainable authorization engine — hybrid ReBAC, RBAC and ABAC in one policy decision point. This console reads and probes the same model the API enforces.',
  'overview.statNamespaces': 'Namespaces',
  'overview.statNamespacesHint': 'Resource types',
  'overview.statRelations': 'Relations',
  'overview.statRelationsHint': 'Across all namespaces',
  'overview.statRelationships': 'Relationships',
  'overview.statRelationshipsHint': 'Stored tuples',
  'overview.statPolicies': 'Policies',
  'overview.statPoliciesHint': 'Live ABAC rules',
  'overview.namespacesTitle': 'Namespaces',
  'overview.namespacesDesc':
    'The resource types in this organization, with their relations and the actions each exposes.',
  'overview.thNamespace': 'Namespace',
  'overview.thRelations': 'Relations',
  'overview.thActions': 'Actions',
  'overview.emptyNamespaces': 'No namespaces defined.',
  'overview.tryItTitle': 'Try it',
  'overview.tryItDesc': 'Probe the graph without leaving the console.',
  'overview.tryCheckBlurb': 'Resolve one decision with reasons.',
  'overview.tryExpandBlurb': 'List everyone who holds a relation.',
  'overview.trySimulateBlurb': 'Compare live vs. a proposed policy.',
  'overview.seededTitle': 'Seeded relationships',
  'overview.seededDesc':
    'The relationship tuples that back the demo, grouped by object. This is the stored graph — Expand resolves it to the full member set.',
  'overview.browseAll': 'Browse all',
  'overview.emptyRelationships': 'No relationships stored.',

  'schema.title': 'Schema',
  'schema.description':
    'The namespace definitions: the relations each resource type declares, the actions clients can request, and the userset rewrites that expand one relation into others.',
  'schema.relations': 'Relations',
  'schema.actions': 'Actions',
  'schema.requires': 'requires',
  'schema.rewrites': 'Rewrites',
  'schema.noRewrites': 'No rewrites — relations resolve directly from stored tuples.',
  'schema.empty': 'No namespaces are defined in this organization.',
  'schema.revision': 'Revision {revision}',

  'schemaForm.define': 'Define namespace',
  'schemaForm.edit': 'Edit',
  'schemaForm.newTitle': 'Define a namespace',
  'schemaForm.newDescription':
    'A namespace is a resource type. Declare its relations, bind each action to the relations that satisfy it, and optionally rewrite a relation to resolve from others.',
  'schemaForm.editTitle': 'Edit namespace',
  'schemaForm.editDescription':
    'Update the relations, action bindings and rewrites. Saving upserts the configuration and advances the revision.',
  'schemaForm.definition': 'Definition',
  'schemaForm.namespace': 'Namespace',
  'schemaForm.namespaceLocked': 'The namespace name is fixed when editing.',
  'schemaForm.relations': 'Relations',
  'schemaForm.noRelations': 'No relations yet — add at least one.',
  'schemaForm.relationPlaceholder': 'viewer',
  'schemaForm.addRelation': 'Add',
  'schemaForm.removeRelation': 'Remove relation',
  'schemaForm.actions': 'Actions',
  'schemaForm.actionsHint':
    'Each action (verb) is satisfied by one or more relations. A check for the action permits when the subject holds any bound relation.',
  'schemaForm.actionRequires': 'is satisfied by',
  'schemaForm.removeAction': 'Remove',
  'schemaForm.addAction': 'Add action',
  'schemaForm.defineRelationsFirst': 'Define relations first.',
  'schemaForm.rewrites': 'Rewrites',
  'schemaForm.rewritesHint':
    'Optionally resolve a relation from others: an alias of another relation (computed_userset), or inheritance through a relation on a linked object (tuple_to_userset). Multiple terms are unioned. Left blank, a relation resolves directly from stored tuples.',
  'schemaForm.resolvesFrom': 'resolves from',
  'schemaForm.direct': 'Direct — stored tuples only.',
  'schemaForm.advancedRewrite':
    'This relation uses an advanced rewrite (intersection/exclusion). It is preserved on save and edited via the API.',
  'schemaForm.addTerm': '+ Add term',
  'schemaForm.removeTerm': 'Remove',
  'schemaForm.termThis': 'Direct (stored tuples)',
  'schemaForm.termComputed': 'Alias of relation',
  'schemaForm.termTupleTo': 'Inherited through',
  'schemaForm.tupleToArrow': "→ target's relation",
  'schemaForm.saving': 'Saving…',
  'schemaForm.save': 'Save namespace',
  'schemaForm.create': 'Create namespace',

  'relationships.title': 'Relationships',
  'relationships.description':
    'The stored relationship tuples — object, relation and subject. This is the raw graph the engine walks; a userset subject (type:id#relation) points at another set. Use Expand in the Playground to resolve a relation to its full member set.',
  'relationships.thObject': 'Object',
  'relationships.thRelation': 'Relation',
  'relationships.thSubject': 'Subject',
  'relationships.thRev': 'Rev',
  'relationships.thActions': 'Actions',
  'relationships.empty': 'No relationship tuples are stored in this organization.',
  'relationships.addTitle': 'Write a relationship',
  'relationships.addDescription':
    'Grant a subject a relation on an object. The engine evaluates access from these tuples — writing viewer on a document lets the read action resolve. A userset subject (subject relation set) points at another set, e.g. group:eng#member.',
  'relationships.fObjectType': 'Object type',
  'relationships.fObjectId': 'Object id',
  'relationships.fRelation': 'Relation',
  'relationships.fSubjectType': 'Subject type',
  'relationships.fSubjectId': 'Subject id',
  'relationships.fSubjectRelation': 'Subject relation',
  'relationships.subjectRelationHint':
    'Optional — set for a userset subject like group:eng#member.',
  'relationships.optional': 'optional',
  'relationships.objectIdPlaceholder': 'onboarding',
  'relationships.subjectIdPlaceholder': 'alice',
  'relationships.write': 'Write relationship',
  'relationships.writing': 'Writing…',
  'relationships.writeOk': 'Written at',
  'relationships.revoke': 'Revoke',
  'relationships.revokeConfirm': 'Confirm revoke',

  'policies.title': 'Policies',
  'policies.description':
    'The live ABAC policies. Each targets a resource type and action, carries a permit or forbid effect, and gates on a condition over principal and environment attributes. Forbid always wins (deny-override).',
  'policies.condition': 'Condition',
  'policies.empty': 'No ABAC policies are defined. Decisions fall back to the relationship graph.',

  'policyForm.new': 'New policy',
  'policyForm.newTitle': 'Write a policy',
  'policyForm.newDescription':
    'An ABAC policy targets a resource type and action, carries a permit or forbid effect, and gates on a condition over principal and environment attributes. Forbid always wins (deny-override).',
  'policyForm.editTitle': 'Edit policy',
  'policyForm.editDescription':
    'Update the effect, target and condition. Saving upserts the policy by id and advances the revision.',
  'policyForm.definition': 'Definition',
  'policyForm.id': 'Policy id',
  'policyForm.idLocked': 'The policy id is fixed when editing.',
  'policyForm.effect': 'Effect',
  'policyForm.resourceType': 'Resource type',
  'policyForm.action': 'Action',
  'policyForm.actionHint': '* targets every action on the resource type.',
  'policyForm.condition': 'Condition',
  'policyForm.conditionHint':
    'The policy applies when this condition holds. A forbid denies; a permit grants only if the relationship graph already allows it.',
  'policyForm.advancedCondition':
    'This policy uses an advanced condition (not, in, or nested logic). It is preserved on save unless you replace it below.',
  'policyForm.replaceWithBuilder': 'Replace with the builder',
  'policyForm.saving': 'Saving…',
  'policyForm.save': 'Save policy',
  'policyForm.create': 'Create policy',
  'policyForm.delete': 'Delete',
  'policyForm.deleteConfirm': 'Confirm delete',
  'policyForm.notFound': 'No policy with that id exists in this organization.',

  'playground.title': 'Playground',
  'playground.description':
    "Resolve, explore and simulate authorization decisions. Every call is proxied server-side through the console's backend-for-frontend — the browser never holds an access token.",
  'playground.tabCheck': 'Check',
  'playground.tabCheckBlurb': 'One decision, fully explained.',
  'playground.tabExpand': 'Expand',
  'playground.tabExpandBlurb': 'Resolve a relation to its subjects.',
  'playground.tabSimulate': 'Simulate',
  'playground.tabSimulateBlurb': 'Live vs. proposed, side by side.',

  'check.intro':
    'Resolve a single decision. The engine walks the relationship graph and evaluates ABAC policies, returning permit or deny with the reasons behind it.',
  'check.evaluateAs': 'Evaluate as',
  'check.asSubject': 'A subject',
  'check.asMe': 'Me',
  'check.hintSubject': 'Owner-gated: check the decision for any subject in the graph.',
  'check.hintMe': 'Check as the signed-in principal, exactly as the API would enforce it.',
  'check.subject': 'Subject',
  'check.subjectHint': 'Any subject in the graph.',
  'check.aal': 'Assurance (AAL)',
  'check.aal1': '1 — password',
  'check.aal2': '2 — MFA',
  'check.aal3': '3 — hardware key',
  'check.aalHint':
    'Only changes the decision when an ABAC policy checks principal.aal. None are seeded — try the “Require MFA” preset under Simulate.',
  'check.submit': 'Check',
  'check.idle': 'Run a check to see the decision.',
  'check.evaluating': 'Evaluating…',

  'expand.intro':
    'Owner-gated. Resolve the full set of subjects that hold a relation on a resource, across role aliases, nested groups, and hierarchy.',
  'expand.relation': 'Relation',
  'expand.submit': 'Expand',
  'expand.idle': 'Expand a relation to see its subject closure.',
  'expand.resolving': 'Resolving…',
  'expand.subjectClosure': 'Subject closure',
  'expand.subjectsOne': '{count} subject',
  'expand.subjectsMany': '{count} subjects',
  'expand.noSubjects': 'No subjects hold this relation.',

  'simulate.intro':
    'Owner-gated and read-only. Evaluate a decision against the live policies and, optionally, a proposed policy overlay — then compare. Writes nothing.',
  'simulate.includeOverlay': 'Include a proposed policy overlay',
  'simulate.effect': 'Effect',
  'simulate.onWhen': 'on {action} when',
  'simulate.submit': 'Simulate',
  'simulate.idle': 'Simulate to compare live and proposed decisions.',
  'simulate.simulating': 'Simulating…',
  'simulate.changed': 'The proposed policy changes this decision.',
  'simulate.unchanged': 'The proposed policy does not change this decision.',
  'simulate.live': 'Live',
  'simulate.proposed': 'Proposed',

  'builder.attribute': 'Attribute',
  'builder.operator': 'Operator',
  'builder.value': 'Value',
  'builder.match': 'Match',
  'builder.ofThese': 'of these',
  'builder.all': 'All',
  'builder.any': 'Any',
  'builder.in': 'in',
  'builder.removeCondition': 'Remove condition',
  'builder.addCondition': '+ Add condition',
  'builder.presets': 'Presets:',
  'builder.presetMfa': 'Require MFA (aal ≥ 2)',
  'builder.presetIp': 'IP allowlist',
  'builder.presetDeadline': 'Before a deadline',
  'builder.viewJson': 'View generated JSON',
  'builder.hideJson': 'Hide generated JSON',

  'decision.relationLabel': 'relation:',
  'decision.noReasons': 'No reasons returned.',
  'decision.permit': 'PERMIT',
  'decision.deny': 'DENY',

  'reason.grant.direct': 'Granted directly by a stored relationship.',
  'reason.grant.userset': 'Granted through a group the subject belongs to.',
  'reason.grant.computed_userset':
    'Granted through a computed role (e.g. owner ⇒ editor ⇒ viewer).',
  'reason.grant.tuple_to_userset': 'Granted by inheritance from a parent resource.',
  'reason.grant.intersection': 'Granted — the subject satisfied every required set.',
  'reason.grant.exclusion': 'Granted — in the base set and not excluded.',
  'reason.grant.policy': 'Permitted by an ABAC policy.',
  'reason.default_deny': 'No relationship or policy grants this access — denied by default.',
  'reason.forbid_matched': 'Denied by a forbid policy whose condition matched.',
  'reason.unknown_action': 'No relation is bound to this action in the namespace.',
  'reason.walk_truncated': 'Traversal stopped at the depth bound; a deeper relationship may exist.',
  'reason.org_mismatch': 'The resource belongs to a different organization.',
  'reason.no_org_context': 'The request is not scoped to an organization.',
  'reason.consistency_unavailable': 'The store has not caught up to the requested consistency.',

  'security.title': 'Account security',
  'security.description':
    'Manage the second factor on this account and verify the integrity of the security audit trail.',
  'security.mfaTitle': 'Multi-factor authentication',
  'security.mfaDescription':
    'A TOTP authenticator app as a second factor. Step-up elevates the session to AAL 2, which policies can require.',
  'security.auditTitle': 'Audit integrity',
  'security.auditDescription':
    'The security-event trail is a SHA-256 hash chain. Verification re-walks it and reports the first tampered record, if any.',

  'mfa.loading': 'Loading MFA status…',
  'mfa.disabledIntro':
    'MFA is not enabled. Enrolling adds a TOTP authenticator and issues one-time recovery codes.',
  'mfa.enable': 'Enable MFA',
  'mfa.enabling': 'Starting…',
  'mfa.enrollScan':
    'Scan this QR with your authenticator app, then enter the 6-digit code to confirm.',
  'mfa.qrAlt': 'TOTP enrollment QR code',
  'mfa.enrollManual': 'Or enter this secret manually:',
  'mfa.codeLabel': 'Authenticator code',
  'mfa.codeHint': 'The 6-digit code from your app.',
  'mfa.activate': 'Activate',
  'mfa.activating': 'Activating…',
  'mfa.codesWarning':
    'Store these recovery codes now — each works once and they will not be shown again.',
  'mfa.codesDone': 'I saved them',
  'mfa.enabled': 'Enabled',
  'mfa.codesRemaining': '{count} recovery codes remaining',
  'mfa.regenerate': 'Regenerate recovery codes',
  'mfa.disable': 'Disable MFA',
  'mfa.stepUpTitle': 'Step up this session',
  'mfa.stepUpHint':
    'Verify a second factor to elevate this session to AAL 2. Use a TOTP code or a recovery code.',
  'mfa.stepUp': 'Elevate to AAL 2',
  'mfa.elevating': 'Elevating…',
  'mfa.stepUpOk': 'Session elevated to AAL 2. The token now carries the higher assurance level.',

  'audit.intro':
    'Re-walk the security audit hash chain and confirm no record was altered or removed.',
  'audit.intact': 'Intact',
  'audit.records': 'The chain verifies across {count} records.',
  'audit.broken': 'Tampered',
  'audit.brokenAt': 'The chain breaks at record {index} of {count}.',
  'audit.verifying': 'Verifying…',
  'audit.reverify': 'Re-verify',
};

const es: Dict = {
  'common.signedIn': 'Sesión iniciada',
  'common.logout': 'Cerrar sesión',
  'common.signingOut': 'Cerrando sesión…',
  'common.apiReference': 'Referencia de la API',
  'common.backHome': '← Volver al inicio',
  'common.language': 'Idioma',
  'common.cancel': 'Cancelar',

  'nav.overview': 'Resumen',
  'nav.schema': 'Esquema',
  'nav.relationships': 'Relaciones',
  'nav.playground': 'Playground',
  'nav.policies': 'Políticas',
  'nav.security': 'Seguridad',

  'brand.suffix': 'Consola',

  'field.resourceType': 'Tipo de recurso',
  'field.resourceId': 'ID del recurso',
  'field.resourceIdHint': 'La instancia específica del objeto.',
  'field.action': 'Acción',
  'field.sentAs': 'Se envía como {action}',

  'errors.unavailable': 'Servicio de autorización no disponible. Intentá de nuevo en un momento.',
  'errors.degraded':
    'No se pudieron cargar algunos datos del servicio de autorización. Se muestra lo disponible.',
  'errors.schemaLoad': 'No se pudo cargar el esquema desde el servicio de autorización.',
  'errors.relationshipsLoad':
    'No se pudieron cargar las relaciones desde el servicio de autorización.',
  'errors.policiesLoad': 'No se pudieron cargar las políticas desde el servicio de autorización.',
  'errors.invalidCredentials':
    'Credenciales inválidas. Revisá el email y la contraseña e intentá de nuevo.',
  'errors.loginUnavailable':
    'Servicio de autorización no disponible. Intentá de nuevo en un momento.',

  'reauth.expired': 'Tu sesión expiró. Iniciá sesión de nuevo para continuar.',
  'reauth.loginAgain': 'Iniciar sesión de nuevo',

  'landing.badge': 'Gestión de Identidad y Accesos',
  'landing.title': 'Un motor de autorización vivo y explicable.',
  'landing.subtitle':
    'AccessCore decide quién puede hacer qué — y muestra su razonamiento. ReBAC, RBAC y ABAC híbridos en un único punto de decisión: grafos de relaciones, roles y condiciones de atributos resueltos en una sola llamada.',
  'landing.openConsole': 'Abrir la consola',
  'landing.readApi': 'Ver la referencia de la API',
  'landing.demoNote':
    'Un demo de portafolio respaldado por una API en vivo. Iniciá sesión con la cuenta demo — las credenciales vienen precargadas en la pantalla de acceso.',
  'landing.featureCheckTitle': 'Check',
  'landing.featureCheckBody':
    'Hacé una pregunta — ¿puede este sujeto realizar esta acción sobre este recurso? Recibís permit o deny, con un rastro explicable de códigos de razón.',
  'landing.featureExpandTitle': 'Expand',
  'landing.featureExpandBody':
    'Recorré el grafo de relaciones al revés. Listá cada sujeto que resuelve a una relación, a través de alias de roles, grupos anidados y jerarquía.',
  'landing.featureSimulateTitle': 'Simulate',
  'landing.featureSimulateBody':
    'Previsualizá un cambio de política antes de aplicarlo. Compará la decisión en vivo contra una política propuesta, lado a lado, con un indicador de cambio.',
  'landing.modelsTitle': 'Un motor, tres modelos',
  'landing.modelsBody':
    'La mayoría de los sistemas los combinan a la fuerza. AccessCore los resuelve en una sola evaluación y devuelve las razones detrás de cada decisión.',
  'landing.rebacDesc':
    'Tuplas de relación estilo Zanzibar con reescrituras computed y tuple-to-userset.',
  'landing.rbacDesc': 'Roles modelados como relaciones y resueltos por el mismo grafo.',
  'landing.abacDesc':
    'Condiciones de atributos sobre el principal y el entorno, evaluadas por petición.',
  'landing.consistencyTerm': 'Consistencia',
  'landing.consistencyDesc':
    'Tokens zookie opcionales para garantías de frescura read-your-writes.',
  'landing.tokenSafeTitle': 'Seguro con tokens por diseño',
  'landing.tokenSafeBody':
    'Esta consola es un backend-for-frontend. El navegador nunca toca un token de acceso — el servidor Next.js guarda la sesión en una cookie httpOnly y hace de proxy de cada llamada de autorización del lado del servidor.',
  'landing.footer': 'AccessCore — demo de portafolio.',
  'landing.openConsoleShort': 'Abrir consola',

  'login.title': 'Iniciá sesión en la Consola',
  'login.subtitle':
    'La cuenta demo viene precargada. Es dueña de {resource} y puede usar todas las vistas de la consola.',
  'login.email': 'Email',
  'login.password': 'Contraseña',
  'login.resetDemo': 'Restablecer al demo',
  'login.submit': 'Iniciar sesión',

  'overview.title': 'Resumen',
  'overview.description':
    'Un motor de autorización vivo y explicable — ReBAC, RBAC y ABAC híbridos en un único punto de decisión. Esta consola lee y explora el mismo modelo que la API aplica.',
  'overview.statNamespaces': 'Namespaces',
  'overview.statNamespacesHint': 'Tipos de recurso',
  'overview.statRelations': 'Relaciones',
  'overview.statRelationsHint': 'En todos los namespaces',
  'overview.statRelationships': 'Vínculos',
  'overview.statRelationshipsHint': 'Tuplas almacenadas',
  'overview.statPolicies': 'Políticas',
  'overview.statPoliciesHint': 'Reglas ABAC en vivo',
  'overview.namespacesTitle': 'Namespaces',
  'overview.namespacesDesc':
    'Los tipos de recurso de esta organización, con sus relaciones y las acciones que cada uno expone.',
  'overview.thNamespace': 'Namespace',
  'overview.thRelations': 'Relaciones',
  'overview.thActions': 'Acciones',
  'overview.emptyNamespaces': 'No hay namespaces definidos.',
  'overview.tryItTitle': 'Probalo',
  'overview.tryItDesc': 'Explorá el grafo sin salir de la consola.',
  'overview.tryCheckBlurb': 'Resolvé una decisión con sus razones.',
  'overview.tryExpandBlurb': 'Listá a todos los que tienen una relación.',
  'overview.trySimulateBlurb': 'Compará en vivo vs. una política propuesta.',
  'overview.seededTitle': 'Relaciones sembradas',
  'overview.seededDesc':
    'Las tuplas de relación que respaldan el demo, agrupadas por objeto. Este es el grafo almacenado — Expand lo resuelve al conjunto completo de miembros.',
  'overview.browseAll': 'Ver todas',
  'overview.emptyRelationships': 'No hay relaciones almacenadas.',

  'schema.title': 'Esquema',
  'schema.description':
    'Las definiciones de namespace: las relaciones que cada tipo de recurso declara, las acciones que los clientes pueden pedir, y las reescrituras de userset que expanden una relación en otras.',
  'schema.relations': 'Relaciones',
  'schema.actions': 'Acciones',
  'schema.requires': 'requiere',
  'schema.rewrites': 'Reescrituras',
  'schema.noRewrites':
    'Sin reescrituras — las relaciones se resuelven directo de las tuplas almacenadas.',
  'schema.empty': 'No hay namespaces definidos en esta organización.',
  'schema.revision': 'Revisión {revision}',

  'schemaForm.define': 'Definir namespace',
  'schemaForm.edit': 'Editar',
  'schemaForm.newTitle': 'Definir un namespace',
  'schemaForm.newDescription':
    'Un namespace es un tipo de recurso. Declará sus relaciones, vinculá cada acción con las relaciones que la satisfacen y, opcionalmente, reescribí una relación para que se resuelva a partir de otras.',
  'schemaForm.editTitle': 'Editar namespace',
  'schemaForm.editDescription':
    'Actualizá las relaciones, los bindings de acción y los rewrites. Guardar hace upsert de la configuración y avanza la revisión.',
  'schemaForm.definition': 'Definición',
  'schemaForm.namespace': 'Namespace',
  'schemaForm.namespaceLocked': 'El nombre del namespace es fijo al editar.',
  'schemaForm.relations': 'Relaciones',
  'schemaForm.noRelations': 'Aún no hay relaciones — agregá al menos una.',
  'schemaForm.relationPlaceholder': 'viewer',
  'schemaForm.addRelation': 'Agregar',
  'schemaForm.removeRelation': 'Quitar relación',
  'schemaForm.actions': 'Acciones',
  'schemaForm.actionsHint':
    'Cada acción (verbo) se satisface con una o más relaciones. Un check de la acción permite cuando el sujeto tiene cualquiera de las relaciones vinculadas.',
  'schemaForm.actionRequires': 'se satisface con',
  'schemaForm.removeAction': 'Quitar',
  'schemaForm.addAction': 'Agregar acción',
  'schemaForm.defineRelationsFirst': 'Definí primero las relaciones.',
  'schemaForm.rewrites': 'Rewrites',
  'schemaForm.rewritesHint':
    'Opcionalmente resolvé una relación a partir de otras: un alias de otra relación (computed_userset), o herencia a través de una relación en un objeto vinculado (tuple_to_userset). Varios términos se unen. En blanco, la relación se resuelve directo de las tuplas almacenadas.',
  'schemaForm.resolvesFrom': 'se resuelve desde',
  'schemaForm.direct': 'Directo — solo tuplas almacenadas.',
  'schemaForm.advancedRewrite':
    'Esta relación usa un rewrite avanzado (intersection/exclusion). Se preserva al guardar y se edita vía la API.',
  'schemaForm.addTerm': '+ Agregar término',
  'schemaForm.removeTerm': 'Quitar',
  'schemaForm.termThis': 'Directo (tuplas almacenadas)',
  'schemaForm.termComputed': 'Alias de relación',
  'schemaForm.termTupleTo': 'Heredado a través de',
  'schemaForm.tupleToArrow': '→ relación del destino',
  'schemaForm.saving': 'Guardando…',
  'schemaForm.save': 'Guardar namespace',
  'schemaForm.create': 'Crear namespace',

  'relationships.title': 'Relaciones',
  'relationships.description':
    'Las tuplas de relación almacenadas — objeto, relación y sujeto. Este es el grafo crudo que el motor recorre; un sujeto userset (tipo:id#relación) apunta a otro conjunto. Usá Expand en el Playground para resolver una relación a su conjunto completo de miembros.',
  'relationships.thObject': 'Objeto',
  'relationships.thRelation': 'Relación',
  'relationships.thSubject': 'Sujeto',
  'relationships.thRev': 'Rev',
  'relationships.thActions': 'Acciones',
  'relationships.empty': 'No hay tuplas de relación almacenadas en esta organización.',
  'relationships.addTitle': 'Escribir una relación',
  'relationships.addDescription':
    'Otorgá a un sujeto una relación sobre un objeto. El motor evalúa el acceso a partir de estas tuplas — escribir viewer en un documento hace que la acción read se resuelva. Un sujeto userset (con relación de sujeto) apunta a otro conjunto, p. ej. group:eng#member.',
  'relationships.fObjectType': 'Tipo de objeto',
  'relationships.fObjectId': 'Id de objeto',
  'relationships.fRelation': 'Relación',
  'relationships.fSubjectType': 'Tipo de sujeto',
  'relationships.fSubjectId': 'Id de sujeto',
  'relationships.fSubjectRelation': 'Relación de sujeto',
  'relationships.subjectRelationHint':
    'Opcional — usala para un sujeto userset como group:eng#member.',
  'relationships.optional': 'opcional',
  'relationships.objectIdPlaceholder': 'onboarding',
  'relationships.subjectIdPlaceholder': 'alice',
  'relationships.write': 'Escribir relación',
  'relationships.writing': 'Escribiendo…',
  'relationships.writeOk': 'Escrita en',
  'relationships.revoke': 'Revocar',
  'relationships.revokeConfirm': 'Confirmar revocación',

  'policies.title': 'Políticas',
  'policies.description':
    'Las políticas ABAC en vivo. Cada una apunta a un tipo de recurso y acción, lleva un efecto permit o forbid, y se activa con una condición sobre atributos del principal y el entorno. Forbid siempre gana (deny-override).',
  'policies.condition': 'Condición',
  'policies.empty':
    'No hay políticas ABAC definidas. Las decisiones recaen en el grafo de relaciones.',

  'policyForm.new': 'Nueva política',
  'policyForm.newTitle': 'Escribir una política',
  'policyForm.newDescription':
    'Una política ABAC apunta a un tipo de recurso y acción, lleva un efecto permit o forbid, y se activa con una condición sobre atributos del principal y el entorno. Forbid siempre gana (deny-override).',
  'policyForm.editTitle': 'Editar política',
  'policyForm.editDescription':
    'Actualizá el efecto, el objetivo y la condición. Guardar hace upsert de la política por id y avanza la revisión.',
  'policyForm.definition': 'Definición',
  'policyForm.id': 'Id de política',
  'policyForm.idLocked': 'El id de la política es fijo al editar.',
  'policyForm.effect': 'Efecto',
  'policyForm.resourceType': 'Tipo de recurso',
  'policyForm.action': 'Acción',
  'policyForm.actionHint': '* apunta a todas las acciones del tipo de recurso.',
  'policyForm.condition': 'Condición',
  'policyForm.conditionHint':
    'La política aplica cuando esta condición se cumple. Un forbid deniega; un permit otorga solo si el grafo de relaciones ya lo permite.',
  'policyForm.advancedCondition':
    'Esta política usa una condición avanzada (not, in o lógica anidada). Se preserva al guardar salvo que la reemplaces abajo.',
  'policyForm.replaceWithBuilder': 'Reemplazar con el constructor',
  'policyForm.saving': 'Guardando…',
  'policyForm.save': 'Guardar política',
  'policyForm.create': 'Crear política',
  'policyForm.delete': 'Eliminar',
  'policyForm.deleteConfirm': 'Confirmar eliminación',
  'policyForm.notFound': 'No existe una política con ese id en esta organización.',

  'playground.title': 'Playground',
  'playground.description':
    'Resolvé, explorá y simulá decisiones de autorización. Cada llamada pasa por el backend-for-frontend de la consola del lado del servidor — el navegador nunca tiene un token de acceso.',
  'playground.tabCheck': 'Consultar',
  'playground.tabCheckBlurb': 'Una decisión, explicada por completo.',
  'playground.tabExpand': 'Expandir',
  'playground.tabExpandBlurb': 'Resolvé una relación a sus sujetos.',
  'playground.tabSimulate': 'Simular',
  'playground.tabSimulateBlurb': 'En vivo vs. propuesta, lado a lado.',

  'check.intro':
    'Resolvé una sola decisión. El motor recorre el grafo de relaciones y evalúa las políticas ABAC, devolviendo permit o deny con las razones detrás.',
  'check.evaluateAs': 'Evaluar como',
  'check.asSubject': 'Un sujeto',
  'check.asMe': 'Yo',
  'check.hintSubject': 'Restringido a owner: consultá la decisión para cualquier sujeto del grafo.',
  'check.hintMe': 'Consultá como el principal con sesión, tal cual lo aplicaría la API.',
  'check.subject': 'Sujeto',
  'check.subjectHint': 'Cualquier sujeto del grafo.',
  'check.aal': 'Aseguramiento (AAL)',
  'check.aal1': '1 — contraseña',
  'check.aal2': '2 — MFA',
  'check.aal3': '3 — llave física',
  'check.aalHint':
    'Solo cambia la decisión cuando una política ABAC evalúa principal.aal. No hay ninguna sembrada — probá el preset “Requerir MFA” en Simular.',
  'check.submit': 'Consultar',
  'check.idle': 'Ejecutá una consulta para ver la decisión.',
  'check.evaluating': 'Evaluando…',

  'expand.intro':
    'Restringido a owner. Resolvé el conjunto completo de sujetos que tienen una relación sobre un recurso, a través de alias de roles, grupos anidados y jerarquía.',
  'expand.relation': 'Relación',
  'expand.submit': 'Expandir',
  'expand.idle': 'Expandí una relación para ver su cierre de sujetos.',
  'expand.resolving': 'Resolviendo…',
  'expand.subjectClosure': 'Cierre de sujetos',
  'expand.subjectsOne': '{count} sujeto',
  'expand.subjectsMany': '{count} sujetos',
  'expand.noSubjects': 'Ningún sujeto tiene esta relación.',

  'simulate.intro':
    'Restringido a owner y de solo lectura. Evaluá una decisión contra las políticas en vivo y, opcionalmente, una política propuesta — y compará. No escribe nada.',
  'simulate.includeOverlay': 'Incluir una política propuesta',
  'simulate.effect': 'Efecto',
  'simulate.onWhen': 'sobre {action} cuando',
  'simulate.submit': 'Simular',
  'simulate.idle': 'Simulá para comparar las decisiones en vivo y propuesta.',
  'simulate.simulating': 'Simulando…',
  'simulate.changed': 'La política propuesta cambia esta decisión.',
  'simulate.unchanged': 'La política propuesta no cambia esta decisión.',
  'simulate.live': 'En vivo',
  'simulate.proposed': 'Propuesta',

  'builder.attribute': 'Atributo',
  'builder.operator': 'Operador',
  'builder.value': 'Valor',
  'builder.match': 'Coincidir',
  'builder.ofThese': 'de estas',
  'builder.all': 'Todas',
  'builder.any': 'Alguna',
  'builder.in': 'en',
  'builder.removeCondition': 'Quitar condición',
  'builder.addCondition': '+ Agregar condición',
  'builder.presets': 'Presets:',
  'builder.presetMfa': 'Requerir MFA (aal ≥ 2)',
  'builder.presetIp': 'Lista de IPs permitidas',
  'builder.presetDeadline': 'Antes de una fecha límite',
  'builder.viewJson': 'Ver JSON generado',
  'builder.hideJson': 'Ocultar JSON generado',

  'decision.relationLabel': 'relación:',
  'decision.noReasons': 'No se devolvieron razones.',
  'decision.permit': 'PERMITIDO',
  'decision.deny': 'DENEGADO',

  'reason.grant.direct': 'Otorgado directamente por una relación almacenada.',
  'reason.grant.userset': 'Otorgado a través de un grupo al que pertenece el sujeto.',
  'reason.grant.computed_userset':
    'Otorgado por un rol computado (p. ej. owner ⇒ editor ⇒ viewer).',
  'reason.grant.tuple_to_userset': 'Otorgado por herencia de un recurso padre.',
  'reason.grant.intersection': 'Otorgado — el sujeto cumplió todos los conjuntos requeridos.',
  'reason.grant.exclusion': 'Otorgado — está en el conjunto base y no fue excluido.',
  'reason.grant.policy': 'Permitido por una política ABAC.',
  'reason.default_deny': 'Ninguna relación o política concede este acceso — denegado por defecto.',
  'reason.forbid_matched': 'Denegado por una política forbid cuya condición coincidió.',
  'reason.unknown_action': 'Ninguna relación está asociada a esta acción en el namespace.',
  'reason.walk_truncated':
    'El recorrido se detuvo en el límite de profundidad; podría existir una relación más profunda.',
  'reason.org_mismatch': 'El recurso pertenece a otra organización.',
  'reason.no_org_context': 'La petición no está en el contexto de una organización.',
  'reason.consistency_unavailable': 'El almacén no alcanzó la consistencia solicitada.',

  'security.title': 'Seguridad de la cuenta',
  'security.description':
    'Gestioná el segundo factor de esta cuenta y verificá la integridad del registro de auditoría de seguridad.',
  'security.mfaTitle': 'Autenticación multifactor',
  'security.mfaDescription':
    'Una app autenticadora TOTP como segundo factor. El step-up eleva la sesión a AAL 2, que las políticas pueden requerir.',
  'security.auditTitle': 'Integridad de la auditoría',
  'security.auditDescription':
    'El registro de eventos de seguridad es una cadena de hashes SHA-256. La verificación la recorre y reporta el primer registro manipulado, si lo hay.',

  'mfa.loading': 'Cargando estado de MFA…',
  'mfa.disabledIntro':
    'MFA no está habilitado. Al enrolar se agrega un autenticador TOTP y se emiten códigos de recuperación de un solo uso.',
  'mfa.enable': 'Habilitar MFA',
  'mfa.enabling': 'Iniciando…',
  'mfa.enrollScan':
    'Escaneá este QR con tu app autenticadora y luego ingresá el código de 6 dígitos para confirmar.',
  'mfa.qrAlt': 'Código QR de enrolamiento TOTP',
  'mfa.enrollManual': 'O ingresá este secreto manualmente:',
  'mfa.codeLabel': 'Código del autenticador',
  'mfa.codeHint': 'El código de 6 dígitos de tu app.',
  'mfa.activate': 'Activar',
  'mfa.activating': 'Activando…',
  'mfa.codesWarning':
    'Guardá estos códigos de recuperación ahora — cada uno funciona una vez y no se volverán a mostrar.',
  'mfa.codesDone': 'Ya los guardé',
  'mfa.enabled': 'Habilitado',
  'mfa.codesRemaining': '{count} códigos de recuperación restantes',
  'mfa.regenerate': 'Regenerar códigos de recuperación',
  'mfa.disable': 'Deshabilitar MFA',
  'mfa.stepUpTitle': 'Elevar esta sesión',
  'mfa.stepUpHint':
    'Verificá un segundo factor para elevar esta sesión a AAL 2. Usá un código TOTP o uno de recuperación.',
  'mfa.stepUp': 'Elevar a AAL 2',
  'mfa.elevating': 'Elevando…',
  'mfa.stepUpOk':
    'Sesión elevada a AAL 2. El token ahora lleva el nivel de aseguramiento superior.',

  'audit.intro':
    'Recorré la cadena de hashes de auditoría y confirmá que ningún registro fue alterado o eliminado.',
  'audit.intact': 'Íntegra',
  'audit.records': 'La cadena verifica a lo largo de {count} registros.',
  'audit.broken': 'Manipulada',
  'audit.brokenAt': 'La cadena se rompe en el registro {index} de {count}.',
  'audit.verifying': 'Verificando…',
  'audit.reverify': 'Re-verificar',
};

export const dictionaries: { en: Dict; es: Dict } = { en, es };
