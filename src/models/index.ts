import type { Db } from '../database/connection.js';
import { ApiTokenModel } from './api-token.model.js';
import { AuditModel } from './audit.model.js';
import { ContentTypeModel } from './content-type.model.js';
import { ContentVersionModel } from './content-version.model.js';
import { EntryModel } from './entry.model.js';
import { MediaModel } from './media.model.js';
import { PasswordResetModel } from './password-reset.model.js';
import { RoleModel } from './role.model.js';
import { SessionModel } from './session.model.js';
import { SsoStateModel } from './sso-state.model.js';
import { UserModel } from './user.model.js';

export interface Models {
  users: UserModel; roles: RoleModel; sessions: SessionModel; tokens: ApiTokenModel;
  media: MediaModel; audit: AuditModel; contentTypes: ContentTypeModel; entries: EntryModel;
  passwordResets: PasswordResetModel; contentVersions: ContentVersionModel; ssoStates: SsoStateModel;
}

export function createModels(db: Db): Models {
  return {
    users: new UserModel(db), roles: new RoleModel(db), sessions: new SessionModel(db), tokens: new ApiTokenModel(db),
    media: new MediaModel(db), audit: new AuditModel(db), contentTypes: new ContentTypeModel(db), entries: new EntryModel(db),
    passwordResets: new PasswordResetModel(db), contentVersions: new ContentVersionModel(db), ssoStates: new SsoStateModel(db),
  };
}
