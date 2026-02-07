import { createInterface } from 'node:readline';
import { rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { type Config } from '../config.js';
import { logger } from '../utils/logger.js';
import { GraphStore } from '../storage/graph.js';

export async function runReset(config: Config, opts: { yes: boolean }): Promise<void> {
  if (!opts.yes) {
    const confirmed = await confirm('This will delete ALL stored data (graph, vectors, scan state). Continue?');
    if (!confirmed) {
      logger.info('Aborted');
      return;
    }
  }

  // Clear Neo4j
  const graphStore = new GraphStore(config.neo4j);
  try {
    await graphStore.connect();
    await graphStore.clearAll();
    logger.info('Cleared Neo4j graph');
  } catch (err) {
    logger.warn(`Could not clear Neo4j: ${err}`);
  } finally {
    await graphStore.close();
  }

  // Clear local data dir
  const dataDir = join(process.cwd(), config.storage.data_dir);
  if (existsSync(dataDir)) {
    rmSync(dataDir, { recursive: true });
    logger.info(`Removed ${dataDir}`);
  }

  // Clear lance data
  const lanceDir = join(process.cwd(), 'lance_data');
  if (existsSync(lanceDir)) {
    rmSync(lanceDir, { recursive: true });
    logger.info(`Removed ${lanceDir}`);
  }

  logger.info('Reset complete');
}

function confirm(message: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  return new Promise((resolve) => {
    rl.question(`${message} [y/N] `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}
