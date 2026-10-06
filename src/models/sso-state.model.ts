import { BaseModel } from './base.model.js';

export interface SsoStateRow {
  state: string;
  code_verifier: string;
  nonce: string;
  redirect_to: string | null;
  expires_at: number;
  created_at: number;
}

/** Penyimpanan state OIDC sekali-pakai (PKCE + nonce + anti-CSRF). */
export class SsoStateModel extends BaseModel {
  insert(row: SsoStateRow): Promise<unknown> { return this.db('forma_sso_states').insert(row); }
  find(state: string): Promise<SsoStateRow | undefined> { return this.db('forma_sso_states').where({ state }).first(); }
  delete(state: string): Promise<number> { return this.db('forma_sso_states').where({ state }).delete(); }
  deleteExpired(now: number): Promise<number> { return this.db('forma_sso_states').where('expires_at', '<', now).delete(); }
}