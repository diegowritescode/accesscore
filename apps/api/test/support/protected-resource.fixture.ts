import { Controller, Get, Module, Param } from '@nestjs/common';
import { AuthnModule } from '../../src/authn/authn.module';
import { AccessTokenGuard } from '../../src/authn/interface/access-token.guard';
import { AuthzModule } from '../../src/authz/authz.module';
import { PermissionGuard } from '../../src/authz/interface/permission.guard';
import {
  RequirePermission,
  resourceFromParam,
} from '../../src/authz/interface/require-permission.decorator';
import { CLOCK } from '../../src/shared/kernel/clock';
import { SystemClock } from '../../src/shared/kernel/system-clock';

@Controller('example')
class ProtectedResourceController {
  @Get('documents/:id')
  @RequirePermission('document.read', resourceFromParam('document', 'id'))
  read(@Param('id') id: string): { document: { id: string } } {
    return { document: { id } };
  }
}

@Module({
  imports: [AuthnModule, AuthzModule],
  controllers: [ProtectedResourceController],
  providers: [{ provide: CLOCK, useClass: SystemClock }, AccessTokenGuard, PermissionGuard],
})
export class ProtectedResourceFixtureModule {}
