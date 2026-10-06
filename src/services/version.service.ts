import { randomBytes } from 'node:crypto';
import type { ContentVersionModel, ContentVersionRow } from '../models/content-version.model.js';

export interface CreateVersionOptions {
  entryId: string;
  data: Record<string, unknown>;
  status: 'draft' | 'published';
  createdBy: string | null;
  changeSummary?: string;
}

export interface VersionInfo {
  id: string;
  versionNumber: number;
  data: Record<string, unknown>;
  status: 'draft' | 'published';
  createdBy: string | null;
  createdAt: number;
  changeSummary: string | null;
}

export interface VersionService {
  createVersion(opts: CreateVersionOptions): Promise<VersionInfo>;
  getVersions(entryId: string, limit?: number): Promise<VersionInfo[]>;
  getVersion(entryId: string, versionNumber: number): Promise<VersionInfo | null>;
  deleteVersions(entryId: string): Promise<void>;
}

export class VersionServiceImpl implements VersionService {
  constructor(private readonly contentVersions: ContentVersionModel) {}

  async createVersion(opts: CreateVersionOptions): Promise<VersionInfo> {
    const { entryId, data, status, createdBy, changeSummary } = opts;

    // Get next version number
    const latestVersion = await this.contentVersions.getLatestVersionNumber(entryId);
    const versionNumber = latestVersion + 1;

    const id = randomBytes(16).toString('hex');
    await this.contentVersions.create({
      id,
      entry_id: entryId,
      version_number: versionNumber,
      data: JSON.stringify(data),
      status,
      created_by: createdBy,
      change_summary: changeSummary || null,
    });

    return {
      id,
      versionNumber,
      data,
      status,
      createdBy,
      createdAt: Date.now(),
      changeSummary: changeSummary || null,
    };
  }

  async getVersions(entryId: string, limit = 50): Promise<VersionInfo[]> {
    const versions = await this.contentVersions.findByEntryId(entryId, limit);
    return versions.map(this.mapToVersionInfo);
  }

  async getVersion(entryId: string, versionNumber: number): Promise<VersionInfo | null> {
    const version = await this.contentVersions.findVersion(entryId, versionNumber);
    if (!version) return null;
    return this.mapToVersionInfo(version);
  }

  async deleteVersions(entryId: string): Promise<void> {
    await this.contentVersions.deleteByEntryId(entryId);
  }

  private mapToVersionInfo(row: ContentVersionRow): VersionInfo {
    let data: Record<string, unknown> = {};
    try {
      data = JSON.parse(row.data);
    } catch {
      // ignore
    }

    return {
      id: row.id,
      versionNumber: row.version_number,
      data,
      status: row.status,
      createdBy: row.created_by,
      createdAt: row.created_at,
      changeSummary: row.change_summary,
    };
  }
}
