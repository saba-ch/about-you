import { type Config } from '../config.js';
import { logger } from '../utils/logger.js';
import { Tracker } from '../scanner/tracker.js';
import { GraphStore } from '../storage/graph.js';
import { VectorStore } from '../storage/vector.js';

export async function runStatus(config: Config): Promise<void> {
  // Scan state
  const tracker = new Tracker(config.storage.data_dir);
  await tracker.load();
  const scanState = tracker.getStats();

  console.log('\n=== About You — Status ===\n');
  console.log(`Files scanned:  ${scanState.fileCount}`);
  console.log(`Last scan:      ${scanState.lastScan || 'never'}`);

  // Graph stats
  const graphStore = new GraphStore(config.neo4j);
  try {
    await graphStore.connect();
    const stats = await graphStore.getStats();
    console.log(`\nGraph DB:`);
    for (const [label, count] of Object.entries(stats.nodeCounts)) {
      console.log(`  ${label}: ${count}`);
    }
    console.log(`  Total relationships: ${stats.relationshipCount}`);
  } catch (err) {
    logger.warn(`Could not connect to Neo4j: ${err}`);
    console.log('\nGraph DB: not available');
  } finally {
    await graphStore.close();
  }

  // Vector store stats
  const vectorStore = new VectorStore(config.storage.data_dir);
  try {
    await vectorStore.init();
    const vectorCount = await vectorStore.count();
    console.log(`\nVector store: ${vectorCount} chunks indexed`);
  } catch (err) {
    logger.warn(`Could not open vector store: ${err}`);
    console.log('\nVector store: not available');
  }

  console.log('');
}
