import { randomBytes } from 'node:crypto';
import { createHash } from 'node:crypto';
import type { Config } from '../config/index.js';
import type { Models } from '../models/index.js';

export interface EmailService {
  sendPasswordResetEmail(email: string, resetUrl: string): Promise<void>;
}

/** Simple email service interface - dapat diganti dengan implementasi SMTP */
export class ConsoleEmailService implements EmailService {
  constructor(private readonly cfg: Config, private readonly models: Models) {}

  async sendPasswordResetEmail(email: string, resetUrl: string): Promise<void> {
    // Untuk development: log ke console
    // Untuk production: implementasikan dengan nodemailer atau service lain
    console.log('\n' + '='.repeat(60));
    console.log('PASSWORD RESET EMAIL');
    console.log('='.repeat(60));
    console.log(`To: ${email}`);
    console.log(`Subject: Reset Your Forma CMS Password`);
    console.log('');
    console.log('Hi,');
    console.log('');
    console.log('You requested to reset your password. Click the link below:');
    console.log('');
    console.log(resetUrl);
    console.log('');
    console.log('This link will expire in 1 hour.');
    console.log('');
    console.log('If you did not request this, please ignore this email.');
    console.log('='.repeat(60) + '\n');
  }
}

export interface PasswordResetService {
  requestReset(email: string): Promise<{ success: boolean; token?: string }>;
  verifyAndReset(token: string, newPassword: string): Promise<{ success: boolean; error?: string }>;
}

export class PasswordResetServiceImpl implements PasswordResetService {
  private readonly TOKEN_EXPIRY_MS = 60 * 60 * 1000; // 1 hour

  constructor(
    private readonly cfg: Config,
    private readonly models: Models,
    private readonly emailService: EmailService,
    private readonly hashPassword: (password: string) => Promise<string>
  ) {}

  async requestReset(email: string): Promise<{ success: boolean; token?: string }> {
    const user = await this.models.users.findByEmail(email);
    if (!user) {
      // Untuk keamanan, selalu return success bahkan jika user tidak ada
      return { success: true };
    }

    // Generate token
    const token = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(token).digest('hex');

    // Hapus token lama untuk user ini
    await this.models.passwordResets.deleteByUserId(user.id);

    // Simpan token baru
    const id = randomBytes(16).toString('hex');
    await this.models.passwordResets.create({
      id,
      user_id: user.id,
      token_hash: tokenHash,
      expires_at: Date.now() + this.TOKEN_EXPIRY_MS,
    });

    // Kirim email
    const resetUrl = `${this.cfg.publicOrigin}/admin/reset-password?token=${token}`;
    await this.emailService.sendPasswordResetEmail(email, resetUrl);

    return { success: true, token }; // token dikembalikan untuk testing/development
  }

  async verifyAndReset(token: string, newPassword: string): Promise<{ success: boolean; error?: string }> {
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const resetToken = await this.models.passwordResets.findByTokenHash(tokenHash);

    if (!resetToken) {
      return { success: false, error: 'Invalid or expired reset token' };
    }

    // Update password
    const passwordHash = await this.hashPassword(newPassword);
    await this.models.users.update(resetToken.user_id, {
      password_hash: passwordHash,
      failed_attempts: 0,
      locked_until: null,
    });

    // Hapus token
    await this.models.passwordResets.deleteByTokenHash(tokenHash);

    // Revoke semua sesi user
    await this.models.sessions.deleteByUser(resetToken.user_id);

    return { success: true };
  }
}
