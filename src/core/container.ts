import type { Config } from '../config/index.js';
import type { Db } from '../database/connection.js';
import { createModels, type Models } from '../models/index.js';
import { hashPassword } from '../security/password.js';
import { ApiTokenService } from '../services/token.service.js';
import { AuditService } from '../services/audit.service.js';
import { AuthService } from '../services/auth.service.js';
import { ContentService } from '../services/content.service.js';
import { ConsoleEmailService } from '../services/email.service.js';
import { PasswordResetServiceImpl } from '../services/email.service.js';
import { GraphQLService } from '../services/graphql.service.js';
import { MediaService } from '../services/media.service.js';
import { RoleService } from '../services/role.service.js';
import { SchemaService } from '../services/schema.service.js';
import { SeedService } from '../services/seed.service.js';
import { SessionService } from '../services/session.service.js';
import { SsoService } from '../services/sso.service.js';
import { TotpServiceImpl } from '../services/totp.service.js';
import { UserService } from '../services/user.service.js';
import { VersionServiceImpl } from '../services/version.service.js';

export interface Services {
  audit: AuditService; schema: SchemaService; content: ContentService; sessions: SessionService; auth: AuthService;
  users: UserService; roles: RoleService; tokens: ApiTokenService; media: MediaService; graphql: GraphQLService;
  totp: TotpServiceImpl; passwordReset: PasswordResetServiceImpl; versions: VersionServiceImpl;
  sso: SsoService; seed: SeedService;
}

/** Composition root untuk dependency injection manual: db -> models -> services. Controller & middleware hanya menerima `AppContext`. */
export interface AppContext { cfg: Config; db: Db; models: Models; services: Services }

export async function createContainer(cfg: Config, db: Db): Promise<AppContext> {
  const models = createModels(db);
  const audit = new AuditService(models.audit, cfg.APP_SECRET);
  const schema = new SchemaService(db, models.contentTypes, models.entries, audit);
  await schema.load();
  const versions = new VersionServiceImpl(models.contentVersions);
  const content = new ContentService({ schema, entries: models.entries, media: models.media, audit, publicOrigin: cfg.publicOrigin, versions });
  const sessions = new SessionService(cfg, models.sessions, models.users, audit);
  const roles = new RoleService(models.roles, models.users, schema, audit);
  const media = new MediaService(cfg, models.media, content, audit);
  await media.init();
  const emailService = new ConsoleEmailService(cfg, models);
  const totp = new TotpServiceImpl(models);
  const passwordReset = new PasswordResetServiceImpl(cfg, models, emailService, hashPassword);
  const auth = new AuthService(models.users, models.roles, sessions, audit, totp);
  const sso = new SsoService(cfg, models.users, models.ssoStates, sessions, auth, audit);
  const seed = new SeedService(schema, content);
  const services: Services = {
    audit, schema, content, sessions, roles, media,
    auth,
    users: new UserService(models.users, models.roles, sessions, audit),
    tokens: new ApiTokenService(models.tokens, models.roles, roles, audit),
    graphql: new GraphQLService(cfg, schema, content),
    totp, passwordReset, versions, sso, seed,
  };
  return { cfg, db, models, services };
}
