import { z } from 'zod';
import { type McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { GraphStore } from '../storage/graph.js';
import { VectorStore } from '../storage/vector.js';
import { logger } from '../utils/logger.js';

export function registerTools(
  server: McpServer,
  graphStore: GraphStore,
  vectorStore: VectorStore,
): void {
  // search_memories: semantic search over vector store
  server.registerTool(
    'search_memories',
    {
      description: 'Semantic search over the user\'s indexed files and extracted memories',
      inputSchema: {
        query: z.string().describe('The search query'),
        limit: z.number().optional().describe('Max results to return (default 10)'),
      },
    },
    async ({ query, limit }) => {
      const results = await vectorStore.search(query, limit ?? 10);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(results, null, 2),
          },
        ],
      };
    },
  );

  // query_graph: run a Cypher query against the knowledge graph
  server.registerTool(
    'query_graph',
    {
      description: 'Run a Cypher query against the knowledge graph. Use this for structured queries about entities and relationships.',
      inputSchema: {
        cypher: z.string().describe('A Cypher query to execute against the Neo4j knowledge graph'),
      },
    },
    async ({ cypher }) => {
      try {
        const results = await graphStore.queryGraph(cypher);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(results, null, 2),
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Query error: ${err}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  // get_entity: get all facts about a specific entity
  server.registerTool(
    'get_entity',
    {
      description: 'Get all known facts about a specific entity (person, organization, skill, etc.)',
      inputSchema: {
        name: z.string().describe('The name of the entity to look up'),
        type: z.string().optional().describe('Optional entity type filter (Person, Organization, Skill, etc.)'),
      },
    },
    async ({ name, type }) => {
      const entity = await graphStore.getEntity(name, type);
      if (!entity) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `No entity found with name "${name}"`,
            },
          ],
        };
      }
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(entity, null, 2),
          },
        ],
      };
    },
  );

  // get_relationships: find connections from/to an entity
  server.registerTool(
    'get_relationships',
    {
      description: 'Find relationships/connections from or to a specific entity',
      inputSchema: {
        entity: z.string().describe('The entity name to find relationships for'),
        rel_type: z.string().optional().describe('Filter by relationship type (WORKS_AT, SKILLED_IN, etc.)'),
        direction: z.enum(['in', 'out', 'both']).optional().describe('Filter by relationship direction'),
      },
    },
    async ({ entity, rel_type, direction }) => {
      const rels = await graphStore.getRelationships(entity, rel_type, direction);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(rels, null, 2),
          },
        ],
      };
    },
  );

  // get_profile: high-level summary of the user
  server.registerTool(
    'get_profile',
    {
      description: 'Get a high-level profile summary of the user, including their connections and facts',
    },
    async () => {
      const profile = await graphStore.getProfile();
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(profile, null, 2),
          },
        ],
      };
    },
  );

  // add_memory: manually add a fact
  server.registerTool(
    'add_memory',
    {
      description: 'Manually add a fact or memory about the user to the knowledge graph',
      inputSchema: {
        content: z.string().describe('The fact or memory to store'),
        entities: z.array(z.string()).optional().describe('Entity names this memory relates to'),
      },
    },
    async ({ content, entities }) => {
      await graphStore.addMemory(content, 'manual');

      // Also add to vector store for search
      await vectorStore.add({
        text: content,
        source_file: 'manual',
        entities: entities ?? [],
        summary: content,
      });

      return {
        content: [
          {
            type: 'text' as const,
            text: `Memory added: "${content}"`,
          },
        ],
      };
    },
  );
}
