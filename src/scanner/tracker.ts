import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { logger } from '../utils/logger.js';

interface ScanEntry {
  hash: string;
  mtime: number;
  scannedAt: string;
}

interface ScanState {
  version: number;
  files: Record<string, ScanEntry>;
  lastScan: string | null;
}

export class Tracker {
  private dataDir: string;
  private statePath: string;
  private state: ScanState;

  constructor(dataDir: string) {
    this.dataDir = dataDir;
    this.statePath = join(this.dataDir, 'scan-state.json');
    this.state = { version: 1, files: {}, lastScan: null };
  }

  async load(): Promise<void> {
    if (!existsSync(this.statePath)) return;

    try {
      const data = await readFile(this.statePath, 'utf-8');
      this.state = JSON.parse(data);
    } catch (err) {
      logger.warn(`Failed to load scan state: ${err}`);
    }
  }

  async save(): Promise<void> {
    if (!existsSync(this.dataDir)) {
      await mkdir(this.dataDir, { recursive: true });
    }
    this.state.lastScan = new Date().toISOString();
    await writeFile(this.statePath, JSON.stringify(this.state, null, 2));
  }

  async isChanged(filePath: string): Promise<boolean> {
    try {
      const stats = await stat(filePath);
      const existing = this.state.files[filePath];
      return !existing || existing.mtime !== stats.mtimeMs;
    } catch {
      return true;
    }
  }

  async markScanned(filePath: string): Promise<void> {
    try {
      const stats = await stat(filePath);
      // Use mtime as a simple change-detection hash
      const hash = `mtime:${stats.mtimeMs}:size:${stats.size}`;
      this.state.files[filePath] = {
        hash,
        mtime: stats.mtimeMs,
        scannedAt: new Date().toISOString(),
      };
    } catch (err) {
      logger.warn(`Failed to track file ${filePath}: ${err}`);
    }
  }

  getStats(): { fileCount: number; lastScan: string | null } {
    return {
      fileCount: Object.keys(this.state.files).length,
      lastScan: this.state.lastScan,
    };
  }
}
