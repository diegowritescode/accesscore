import {
  Body,
  Controller,
  Delete,
  HttpCode,
  Inject,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { AccessTokenGuard, type AuthTokenClaims } from '../../authn/interface/access-token.guard';
import { AuthToken } from '../../authn/interface/auth-token.decorator';
import { ProblemException } from '../../shared/http/problem-details';
import { OrgId } from '../../shared/kernel/org-id';
import {
  NAMESPACE_CONFIG_WRITER,
  type NamespaceConfigWriter,
} from '../application/namespace-config-writer';
import {
  RELATION_TUPLE_WRITER,
  type RelationTupleCommand,
  type RelationTupleWriter,
} from '../application/relation-tuple-writer';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { namespaceDefinitionSchema, openApiSchema } from '../../shared/http/openapi-schema';
import { type SubjectRef } from '../domain/subject-ref';
import { PapAdminGuard } from './pap-admin.guard';
import { defineNamespaceSchema, writeTupleSchema } from './pap.dto';

interface TokenResponse {
  consistency_token: string;
}

const badRequest = (detail?: string): ProblemException =>
  new ProblemException({
    type: 'about:blank',
    title: 'Invalid administration request',
    status: 400,
    detail,
  });

const noActiveOrg = (): ProblemException =>
  new ProblemException({ type: 'about:blank', title: 'No active organization', status: 403 });

@ApiTags('pap')
@ApiBearerAuth('access-token')
@Controller('authz')
@UseGuards(AccessTokenGuard, PapAdminGuard)
export class PapController {
  constructor(
    @Inject(RELATION_TUPLE_WRITER) private readonly tuples: RelationTupleWriter,
    @Inject(NAMESPACE_CONFIG_WRITER) private readonly namespaces: NamespaceConfigWriter,
  ) {}

  @Post('tuples')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Write a relationship tuple',
    description: 'Owner-gated. Upserts a tuple in the caller org and returns a consistency token.',
  })
  @ApiBody({ schema: openApiSchema(writeTupleSchema) })
  @ApiResponse({ status: 200, description: 'The consistency token after the write.' })
  async writeTuple(
    @AuthToken() token: AuthTokenClaims,
    @Body() body: unknown,
  ): Promise<TokenResponse> {
    const zookie = await this.tuples.write(this.toCommand(token, body));
    return { consistency_token: zookie.encode() };
  }

  @Delete('tuples')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Revoke a relationship tuple',
    description: 'Owner-gated. Deletes a tuple in the caller org and returns a consistency token.',
  })
  @ApiBody({ schema: openApiSchema(writeTupleSchema) })
  @ApiResponse({ status: 200, description: 'The consistency token after the revoke.' })
  async revokeTuple(
    @AuthToken() token: AuthTokenClaims,
    @Body() body: unknown,
  ): Promise<TokenResponse> {
    const zookie = await this.tuples.revoke(this.toCommand(token, body));
    return { consistency_token: zookie.encode() };
  }

  @Put('namespaces/:namespace')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Define a namespace configuration',
    description:
      'Owner-gated. Upserts the relations, action bindings, and userset rewrites (this / ' +
      'computed_userset / tuple_to_userset / union) for a namespace in the caller org.',
  })
  @ApiParam({ name: 'namespace', description: 'The namespace (object type) to define.' })
  @ApiBody({ schema: namespaceDefinitionSchema })
  @ApiResponse({ status: 200, description: 'The consistency token after the definition.' })
  async defineNamespace(
    @AuthToken() token: AuthTokenClaims,
    @Param('namespace') namespace: string,
    @Body() body: unknown,
  ): Promise<TokenResponse> {
    if (!token.org) {
      throw noActiveOrg();
    }
    const parsed = defineNamespaceSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest();
    }
    const result = await this.namespaces.define({
      orgId: OrgId.fromString(token.org),
      namespace,
      config: parsed.data,
    });
    if (!result.ok) {
      throw badRequest(result.error);
    }
    return { consistency_token: result.value.encode() };
  }

  private toCommand(token: AuthTokenClaims, body: unknown): RelationTupleCommand {
    if (!token.org) {
      throw noActiveOrg();
    }
    const parsed = writeTupleSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest();
    }
    const { object, relation, subject } = parsed.data;
    const subjectRef: SubjectRef =
      subject.relation !== undefined
        ? {
            kind: 'userset',
            ref: { type: subject.type, id: subject.id },
            relation: subject.relation,
          }
        : { kind: 'subject', ref: { type: subject.type, id: subject.id } };
    return {
      orgId: OrgId.fromString(token.org),
      object: { type: object.type, id: object.id },
      relation,
      subject: subjectRef,
    };
  }
}
