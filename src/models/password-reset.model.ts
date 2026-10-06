import { BaseModel } from './base.model.js';

export interface PasswordResetRow {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: number;
  created_at: number;
}

export class PasswordResetModel extends BaseModel {
  async create(data: Omit<PasswordResetRow, 'created_at'>): Promise<void> {
    await this.db('forma_password_reset_tokens').insert({
      ...data,
      created_at: Date.now(),
    });
  }

  async findByTokenHash(tokenHash: string): Promise<PasswordResetRow | undefined> {
    return this.db('forma_password_reset_tokens')
      .where({ token_hash: tokenHash })
      .where('expires_at', '>', Date.now())
      .first();
  }

  async deleteByTokenHash(tokenHash: string): Promise<number> {
    return this.db('forma_password_reset_tokens').where({ token_hash: tokenHash }).delete();
  }

  async deleteByUserId(userId: string): Promise<number> {
    return this.db('forma_password_reset_tokens').where({ user_id: userId }).delete();
  }

  async deleteExpired(): Promise<number> {
    return this.db('forma_password_reset_tokens').where('expires_at', '<=', Date.now()).delete();
  }
}
