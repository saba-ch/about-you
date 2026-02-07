import { readdir, stat } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { existsSync } from 'node:fs';
import ignore from 'ignore';
import { logger } from '../utils/logger.js';

const SUPPORTED_EXTENSIONS = new Set([
  '.md', '.txt', '.json', '.yaml', '.yml', '.toml',
  '.csv', '.tsv',
  '.pdf',
  '.docx',
  '.html', '.htm',
  '.tex',
  '.org', '.rst',
  '.ts', '.tsx', '.js', '.jsx',
  '.py', '.rb', '.go', '.rs', '.java', '.kt', '.swift',
  '.sh', '.bash', '.zsh',
  '.xml', '.svg',
  '.env', '.ini', '.cfg', '.conf',
]);

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

/**
 * Streaming crawler — yields file paths one at a time instead of
 * collecting them all into a giant array.
 */
export async function* crawl(
  directories: string[],
  ignorePatterns: string[],
): AsyncGenerator<string> {
  const ig = ignore().add(ignorePatterns);

  for (const dir of directories) {
    if (!existsSync(dir)) {
      logger.warn(`Directory does not exist: ${dir}`);
      continue;
    }

    yield* walkDir(dir, dir, ig);
  }
}

async function* walkDir(
  root: string,
  dir: string,
  ig: ignore.Ignore,
): AsyncGenerator<string> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (err) {
    logger.debug(`Cannot read directory ${dir}: ${err}`);
    return;
  }

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    const relativePath = fullPath.slice(root.length + 1);

    if (ig.ignores(relativePath) || ig.ignores(entry.name)) {
      continue;
    }

    if (entry.isDirectory()) {
      yield* walkDir(root, fullPath, ig);
    } else if (entry.isFile()) {
      const ext = extname(entry.name).toLowerCase();
      if (!SUPPORTED_EXTENSIONS.has(ext)) continue;

      try {
        const stats = await stat(fullPath);
        if (stats.size > MAX_FILE_SIZE) {
          logger.debug(`Skipping large file: ${fullPath} (${(stats.size / 1024 / 1024).toFixed(1)}MB)`);
          continue;
        }
        if (stats.size === 0) continue;

        yield fullPath;
      } catch {
        // Skip files we can't stat
      }
    }
  }
}
