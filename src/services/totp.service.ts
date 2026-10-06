import { generateBackupCodes, generateTotpSecret, generateTotpUri, verifyTotp } from '../security/totp.js';
import type { Models } from '../models/index.js';
import { hashPassword, verifyPassword } from '../security/password.js';

export interface TotpSetupResult {
  secret: string;
  qrCodeUri: string;
  backupCodes: string[];
}

export interface TotpStatus {
  enabled: boolean;
  setupComplete: boolean;
}

export interface TotpService {
  status(userId: string): Promise<TotpStatus>;
  setup(userId: string): Promise<TotpSetupResult>;
  enable(userId: string, code: string): Promise<{ success: boolean; error?: string }>;
  disable(userId: string, password: string): Promise<{ success: boolean; error?: string }>;
  verify(userId: string, code: string): Promise<boolean>;
  verifyBackupCode(userId: string, code: string): Promise<boolean>;
  regenerateBackupCodes(userId: string, password: string): Promise<{ success: boolean; codes?: string[]; error?: string }>;
}

export class TotpServiceImpl implements TotpService {
  constructor(private readonly models: Models) {}

  async status(userId: string): Promise<TotpStatus> {
    const user = await this.models.users.find(userId);
    if (!user) throw new Error('User not found');
    return { enabled: !!user.totp_enabled, setupComplete: !!user.totp_secret };
  }

  async setup(userId: string): Promise<TotpSetupResult> {
    const user = await this.models.users.find(userId);
    if (!user) throw new Error('User not found');

    const secret = generateTotpSecret();
    const qrCodeUri = generateTotpUri(secret, user.email);
    const backupCodes = generateBackupCodes();

    // Simpan secret (belum enabled) dan backup codes (hashed)
    const hashedBackupCodes = await Promise.all(
      backupCodes.map((code) => hashPassword(code))
    );

    await this.models.users.update(userId, {
      totp_secret: secret,
      backup_codes: JSON.stringify(hashedBackupCodes),
    });

    return { secret, qrCodeUri, backupCodes };
  }

  async enable(userId: string, code: string): Promise<{ success: boolean; error?: string }> {
    const user = await this.models.users.find(userId);
    if (!user || !user.totp_secret) {
      return { success: false, error: 'TOTP not set up' };
    }

    if (user.totp_enabled) {
      return { success: false, error: 'TOTP already enabled' };
    }

    if (!verifyTotp(user.totp_secret, code)) {
      return { success: false, error: 'Invalid code' };
    }

    await this.models.users.update(userId, { totp_enabled: true });
    return { success: true };
  }

  async disable(userId: string, password: string): Promise<{ success: boolean; error?: string }> {
    const user = await this.models.users.find(userId);
    if (!user) return { success: false, error: 'User not found' };

    // Verify password
    const passwordMatch = await verifyPassword(password, user.password_hash);
    if (!passwordMatch) {
      return { success: false, error: 'Invalid password' };
    }

    await this.models.users.update(userId, {
      totp_secret: null,
      totp_enabled: false,
      backup_codes: null,
    });

    return { success: true };
  }

  async verify(userId: string, code: string): Promise<boolean> {
    const user = await this.models.users.find(userId);
    if (!user || !user.totp_enabled || !user.totp_secret) return false;
    return verifyTotp(user.totp_secret, code);
  }

  async verifyBackupCode(userId: string, code: string): Promise<boolean> {
    const user = await this.models.users.find(userId);
    if (!user || !user.backup_codes) return false;

    try {
      const hashedCodes: string[] = JSON.parse(user.backup_codes);
      const normalized = code.toUpperCase();

      // Cek apakah ada backup code yang cocok (bandingkan hash)
      let foundIndex = -1;
      for (let i = 0; i < hashedCodes.length; i++) {
        if (await verifyPassword(normalized, hashedCodes[i])) {
          foundIndex = i;
          break;
        }
      }

      if (foundIndex === -1) return false;

      // Hapus backup code yang sudah dipakai (one-time use)
      hashedCodes.splice(foundIndex, 1);
      await this.models.users.update(userId, {
        backup_codes: JSON.stringify(hashedCodes),
      });

      return true;
    } catch {
      return false;
    }
  }

  async regenerateBackupCodes(
    userId: string,
    password: string
  ): Promise<{ success: boolean; codes?: string[]; error?: string }> {
    const user = await this.models.users.find(userId);
    if (!user) return { success: false, error: 'User not found' };

    const passwordMatch = await verifyPassword(password, user.password_hash);
    if (!passwordMatch) {
      return { success: false, error: 'Invalid password' };
    }

    const backupCodes = generateBackupCodes();
    const hashedBackupCodes = await Promise.all(
      backupCodes.map((code) => hashPassword(code))
    );

    await this.models.users.update(userId, {
      backup_codes: JSON.stringify(hashedBackupCodes),
    });

    return { success: true, codes: backupCodes };
  }
}
