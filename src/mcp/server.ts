import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { type Config } from '../config.js';
import { GraphStore } from '../storage/graph.js';
import { VectorStore } from '../storage/vector.js';
import { registerTools } from './tools.js';
import { logger } from '../utils/logger.js';

export interface AboutYouMCPServer {
  start(): Promise<void>;
}

export async function createMCPServer(config: Config): Promise<AboutYouMCPServer> {
  const server = new McpServer(
    {
      name: 'about-you',
      version: '0.1.0',
    },
    {
      capabilities: {
        resources: {},
        tools: {},
      },
    },
  );

  // Initialize storage connections
  const graphStore = new GraphStore(config.neo4j);
  const vectorStore = new VectorStore(config.storage.data_dir);

  let graphConnected = false;

  try {
    await graphStore.connect();
    graphConnected = true;
  } catch (err) {
    logger.warn(`Neo4j not available: ${err}. Graph tools will return errors.`);
  }

  try {
    await vectorStore.init();
  } catch (err) {
    logger.warn(`Vector store init failed: ${err}. Search tools will return empty results.`);
  }

  // Register tools
  registerTools(server, graphStore, vectorStore);

  // Register resources
  server.registerResource(
    'profile',
    'aboutyou://profile',
    {
      description: 'User profile summary from the knowledge graph',
      mimeType: 'application/json',
    },
    async () => {
      if (!graphConnected) {
        return { contents: [{ uri: 'aboutyou://profile', text: '{"error": "Neo4j not connected"}' }] };
      }
      const profile = await graphStore.getProfile();
      return {
        contents: [
          {
            uri: 'aboutyou://profile',
            text: JSON.stringify(profile, null, 2),
          },
        ],
      };
    },
  );

  server.registerResource(
    'entities',
    'aboutyou://entities',
    {
      description: 'All entities by type in the knowledge graph',
      mimeType: 'application/json',
    },
    async () => {
      if (!graphConnected) {
        return { contents: [{ uri: 'aboutyou://entities', text: '{"error": "Neo4j not connected"}' }] };
      }
      const stats = await graphStore.getStats();
      return {
        contents: [
          {
            uri: 'aboutyou://entities',
            text: JSON.stringify(stats.nodeCounts, null, 2),
          },
        ],
      };
    },
  );

  server.registerResource(
    'stats',
    'aboutyou://stats',
    {
      description: 'Scan statistics',
      mimeType: 'application/json',
    },
    async () => {
      const vectorCount = await vectorStore.count();
      let graphStats = null;
      if (graphConnected) {
        graphStats = await graphStore.getStats();
      }
      return {
        contents: [
          {
            uri: 'aboutyou://stats',
            text: JSON.stringify(
              {
                vectorChunks: vectorCount,
                graph: graphStats,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  return {
    start: async () => {
      const transport = new StdioServerTransport();
      await server.connect(transport);
      logger.info('MCP server running on stdio');

      // Handle shutdown
      process.on('SIGINT', async () => {
        await graphStore.close();
        await server.close();
        process.exit(0);
      });
    },
  };
}
