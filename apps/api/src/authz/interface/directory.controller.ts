import { Controller, Get, Inject, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AccessTokenGuard, type AuthTokenClaims } from '../../authn/interface/access-token.guard';
import { AuthToken } from '../../authn/interface/auth-token.decorator';
import { ProblemException } from '../../shared/http/problem-details';
import { OrgId } from '../../shared/kernel/org-id';
import {
  AUTHZ_DIRECTORY,
  type AuthzDirectoryService,
  type NamespaceDetailView,
  type NamespaceSummaryView,
  type PolicyView,
  type SubjectView,
  type TupleView,
} from '../application/directory-service';
import { tupleQuerySchema } from './check.dto';
import { PapAdminGuard } from './pap-admin.guard';

const badRequest = (): ProblemException =>
  new ProblemException({ type: 'about:blank', title: 'Invalid directory query', status: 400 });

const notFound = (): ProblemException =>
  new ProblemException({ type: 'about:blank', title: 'Namespace not found', status: 404 });

const unavailable = (): ProblemException =>
  new ProblemException({
    type: 'about:blank',
    title: 'Authorization service unavailable',
    status: 503,
  });

@ApiTags('authz')
@ApiBearerAuth('access-token')
@Controller('authz')
@UseGuards(AccessTokenGuard, PapAdminGuard)
export class DirectoryController {
  constructor(@Inject(AUTHZ_DIRECTORY) private readonly directory: AuthzDirectoryService) {}

  @Get('namespaces')
  @ApiOperation({
    summary: 'List the namespaces in the organization',
    description: 'Owner-gated. Returns each namespace with its relations and available actions.',
  })
  @ApiResponse({ status: 200, description: 'The namespaces and their relations/actions.' })
  async namespaces(
    @AuthToken() token: AuthTokenClaims,
  ): Promise<{ namespaces: NamespaceSummaryView[] }> {
    const orgId = this.orgOf(token);
    try {
      return { namespaces: await this.directory.listNamespaces(orgId) };
    } catch {
      throw unavailable();
    }
  }

  @Get('namespaces/:namespace')
  @ApiOperation({
    summary: 'Describe one namespace',
    description: 'Owner-gated. Returns the relations, action bindings and userset rewrites.',
  })
  @ApiResponse({ status: 200, description: 'The namespace schema.' })
  @ApiResponse({ status: 404, description: 'No such namespace in the organization.' })
  async namespace(
    @AuthToken() token: AuthTokenClaims,
    @Param('namespace') namespace: string,
  ): Promise<NamespaceDetailView> {
    const orgId = this.orgOf(token);
    let detail: NamespaceDetailView | null;
    try {
      detail = await this.directory.getNamespace(orgId, namespace);
    } catch {
      throw unavailable();
    }
    if (!detail) {
      throw notFound();
    }
    return detail;
  }

  @Get('tuples')
  @ApiOperation({
    summary: 'Browse relationship tuples',
    description:
      'Owner-gated. Lists relationship tuples filtered by namespace, object, relation or ' +
      'subject, ordered and paginated. This is the stored graph, not the resolved closure.',
  })
  @ApiResponse({ status: 200, description: 'The matching tuples.' })
  async tuples(
    @AuthToken() token: AuthTokenClaims,
    @Query() query: unknown,
  ): Promise<{ tuples: TupleView[] }> {
    const orgId = this.orgOf(token);
    const parsed = tupleQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw badRequest();
    }
    let subject: SubjectView | undefined;
    if (parsed.data.subjectType !== undefined && parsed.data.subjectId !== undefined) {
      subject = {
        type: parsed.data.subjectType,
        id: parsed.data.subjectId,
        relation: parsed.data.subjectRelation,
      };
    }
    try {
      const tuples = await this.directory.listTuples(orgId, {
        namespace: parsed.data.namespace,
        objectId: parsed.data.objectId,
        relation: parsed.data.relation,
        subject,
        limit: parsed.data.limit,
        offset: parsed.data.offset,
      });
      return { tuples };
    } catch {
      throw unavailable();
    }
  }

  @Get('policies')
  @ApiOperation({
    summary: 'List the ABAC policies in the organization',
    description: 'Owner-gated. Returns each policy with its effect, target and condition AST.',
  })
  @ApiResponse({ status: 200, description: 'The organization policies.' })
  async policies(@AuthToken() token: AuthTokenClaims): Promise<{ policies: PolicyView[] }> {
    const orgId = this.orgOf(token);
    try {
      return { policies: await this.directory.listPolicies(orgId) };
    } catch {
      throw unavailable();
    }
  }

  private orgOf(token: AuthTokenClaims): OrgId {
    if (!token.org) {
      throw badRequest();
    }
    return OrgId.fromString(token.org);
  }
}
