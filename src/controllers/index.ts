import type { AppContext } from '../core/container.js';
import { AuditController } from './audit.controller.js';
import { AuthController } from './auth.controller.js';
import { ContentController } from './content.controller.js';
import { ContentTypeController } from './content-type.controller.js';
import { GraphQLController } from './graphql.controller.js';
import { HealthController } from './health.controller.js';
import { MediaController } from './media.controller.js';
import { PasswordResetController } from './password-reset.controller.js';
import { RoleController } from './role.controller.js';
import { SsoController } from './sso.controller.js';
import { TokenController } from './token.controller.js';
import { TotpController } from './totp.controller.js';
import { UserController } from './user.controller.js';
import { VersionController } from './version.controller.js';

export function createControllers(ctx: AppContext) {
  return {
    health: new HealthController(), auth: new AuthController(ctx), users: new UserController(ctx), roles: new RoleController(ctx),
    tokens: new TokenController(ctx), contentTypes: new ContentTypeController(ctx), content: new ContentController(ctx),
    media: new MediaController(ctx), audit: new AuditController(ctx), graphql: new GraphQLController(ctx),
    totp: new TotpController(ctx), passwordReset: new PasswordResetController(ctx), versions: new VersionController(ctx),
    sso: new SsoController(ctx),
  };
}
export type Controllers = ReturnType<typeof createControllers>;
