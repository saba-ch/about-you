import { type Config } from '../config.js';
import { logger } from '../utils/logger.js';
import { createMCPServer } from '../mcp/server.js';

export async function runServe(config: Config): Promise<void> {
  logger.info('Starting MCP server (stdio transport)...');
  const server = await createMCPServer(config);
  await server.start();
}
