import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { type Config } from '../config.js';
import { logger } from '../utils/logger.js';
import { runExtraction } from '../extraction/agent.js';
import { GraphStore } from '../storage/graph.js';
import { VectorStore } from '../storage/vector.js';

export async function runScan(config: Config, opts: { dryRun: boolean }): Promise<void> {
  const directories = config.scan.directories
    .map(d => d.startsWith('~') ? resolve(homedir(), d.slice(2)) : resolve(d))
    .filter(d => {
      if (!existsSync(d)) {
        logger.warn(`Directory does not exist: ${d}`);
        return false;
      }
      return true;
    });

  if (directories.length === 0) {
    logger.error('No valid directories to scan');
    return;
  }

  if (opts.dryRun) {
    logger.info('Would scan these directories:');
    for (const d of directories) console.log(`  ${d}`);
    return;
  }

  // Initialize storage
  const graphStore = new GraphStore(config.neo4j);
  const vectorStore = new VectorStore(config.storage.data_dir);

  try {
    await graphStore.connect();
    await vectorStore.init();

    let totalEntities = 0;
    let totalRelationships = 0;
    let totalMemories = 0;

    for (const directory of directories) {
      logger.info(`\nScanning: ${directory}`);

      try {
        const result = await runExtraction(directory, config.extraction);

        if (result.entities.length > 0 || result.relationships.length > 0) {
          await graphStore.upsert(result.entities, result.relationships);
          totalEntities += result.entities.length;
          totalRelationships += result.relationships.length;
        }

        for (const memory of result.memories) {
          await graphStore.addMemory(memory, directory);
          totalMemories++;
        }

        // Index extraction summaries in vector store
        if (result.memories.length > 0) {
          await vectorStore.addBatch(
            result.memories.map(m => ({
              text: m,
              source_file: directory,
              entities: result.entities.map(e => e.name),
              summary: result.summary || '',
            })),
          );
        }
      } catch (err) {
        logger.error(`Failed scanning ${directory}: ${err}`);
      }
    }

    logger.info('\nScan complete!');
    logger.info(`  Entities:      ${totalEntities}`);
    logger.info(`  Relationships: ${totalRelationships}`);
    logger.info(`  Memories:      ${totalMemories}`);
  } finally {
    await graphStore.close();
  }
}
