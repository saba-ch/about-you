import neo4j, { type Driver, type Session } from 'neo4j-driver';
import { CONSTRAINTS, VALID_LABELS, type ExtractedEntity, type ExtractedRelationship } from './schema.js';
import { logger } from '../utils/logger.js';

interface Neo4jConfig {
  uri: string;
  username: string;
  password: string;
}

export class GraphStore {
  private driver: Driver | null = null;
  private config: Neo4jConfig;

  constructor(config: Neo4jConfig) {
    this.config = config;
  }

  async connect(): Promise<void> {
    this.driver = neo4j.driver(
      this.config.uri,
      neo4j.auth.basic(this.config.username, this.config.password),
    );
    await this.driver.verifyConnectivity();
    logger.debug('Connected to Neo4j');
    await this.initConstraints();
  }

  async close(): Promise<void> {
    if (this.driver) {
      await this.driver.close();
      this.driver = null;
    }
  }

  private getSession(): Session {
    if (!this.driver) throw new Error('Not connected to Neo4j');
    return this.driver.session();
  }

  private async initConstraints(): Promise<void> {
    const session = this.getSession();
    try {
      for (const constraint of CONSTRAINTS) {
        try {
          await session.run(constraint);
        } catch {
          // Constraint may already exist, that's fine
        }
      }
      logger.debug('Neo4j constraints initialized');
    } finally {
      await session.close();
    }
  }

  async upsert(entities: ExtractedEntity[], relationships: ExtractedRelationship[]): Promise<void> {
    const session = this.getSession();
    try {
      // Upsert entities
      for (const entity of entities) {
        if (!VALID_LABELS.has(entity.type)) {
          logger.warn(`Skipping entity with invalid label: ${entity.type}`);
          continue;
        }

        const props = { name: entity.name, ...entity.properties };
        const setClause = Object.keys(props)
          .map(k => `n.${sanitizeKey(k)} = $props.${sanitizeKey(k)}`)
          .join(', ');

        await session.run(
          `MERGE (n:${entity.type} {name: $name})
           ON CREATE SET ${setClause}, n.created_at = datetime()
           ON MATCH SET ${setClause}, n.updated_at = datetime()`,
          { name: entity.name, props },
        );
      }

      // Upsert relationships
      for (const rel of relationships) {
        if (!VALID_LABELS.has(rel.fromType) || !VALID_LABELS.has(rel.toType)) {
          logger.warn(`Skipping relationship with invalid labels: ${rel.fromType} -> ${rel.toType}`);
          continue;
        }

        const relType = sanitizeRelType(rel.type);
        const propSetters = Object.keys(rel.properties)
          .map(k => `r.${sanitizeKey(k)} = $props.${sanitizeKey(k)}`)
          .join(', ');

        const setClause = propSetters
          ? `ON CREATE SET ${propSetters}, r.created_at = datetime()
             ON MATCH SET ${propSetters}, r.updated_at = datetime()`
          : `ON CREATE SET r.created_at = datetime()`;

        await session.run(
          `MATCH (a:${rel.fromType} {name: $from})
           MATCH (b:${rel.toType} {name: $to})
           MERGE (a)-[r:${relType}]->(b)
           ${setClause}`,
          { from: rel.from, to: rel.to, props: rel.properties },
        );
      }
    } finally {
      await session.close();
    }
  }

  async addMemory(content: string, sourceFile: string): Promise<void> {
    const session = this.getSession();
    try {
      await session.run(
        `CREATE (m:Memory {
          content: $content,
          source_file: $sourceFile,
          created_at: datetime()
        })`,
        { content, sourceFile },
      );
    } finally {
      await session.close();
    }
  }

  async getEntity(name: string, type?: string): Promise<Record<string, unknown> | null> {
    const session = this.getSession();
    try {
      const labelFilter = type ? `:${type}` : '';
      const result = await session.run(
        `MATCH (n${labelFilter} {name: $name})
         OPTIONAL MATCH (n)-[r]-(m)
         RETURN n, collect({rel: type(r), dir: CASE WHEN startNode(r) = n THEN 'out' ELSE 'in' END, node: m}) as connections`,
        { name },
      );

      if (result.records.length === 0) return null;

      const record = result.records[0];
      const node = record.get('n').properties;
      const connections = record.get('connections')
        .filter((c: Record<string, unknown>) => c.node !== null)
        .map((c: Record<string, unknown>) => ({
          relationship: c.rel,
          direction: c.dir,
          entity: (c.node as Record<string, unknown>).properties,
        }));

      return { ...node, connections };
    } finally {
      await session.close();
    }
  }

  async getRelationships(
    entity: string,
    relType?: string,
    direction?: 'in' | 'out' | 'both',
  ): Promise<Array<Record<string, unknown>>> {
    const session = this.getSession();
    try {
      let query: string;
      if (direction === 'out') {
        query = relType
          ? `MATCH (a {name: $entity})-[r:${sanitizeRelType(relType)}]->(b) RETURN a, r, b`
          : `MATCH (a {name: $entity})-[r]->(b) RETURN a, r, b`;
      } else if (direction === 'in') {
        query = relType
          ? `MATCH (a {name: $entity})<-[r:${sanitizeRelType(relType)}]-(b) RETURN a, r, b`
          : `MATCH (a {name: $entity})<-[r]-(b) RETURN a, r, b`;
      } else {
        query = relType
          ? `MATCH (a {name: $entity})-[r:${sanitizeRelType(relType)}]-(b) RETURN a, r, b`
          : `MATCH (a {name: $entity})-[r]-(b) RETURN a, r, b`;
      }

      const result = await session.run(query, { entity });
      return result.records.map(record => ({
        from: record.get('a').properties,
        relationship: record.get('r').type,
        relationshipProps: record.get('r').properties,
        to: record.get('b').properties,
      }));
    } finally {
      await session.close();
    }
  }

  async getProfile(): Promise<Record<string, unknown>> {
    const session = this.getSession();
    try {
      // Find the "self" person node
      const selfResult = await session.run(
        `MATCH (p:Person {relation: 'self'})
         OPTIONAL MATCH (p)-[r]-(n)
         RETURN p, collect({rel: type(r), dir: CASE WHEN startNode(r) = p THEN 'out' ELSE 'in' END, node: properties(n), labels: labels(n)}) as connections`,
      );

      if (selfResult.records.length === 0) {
        // Fallback: try to find any Person node
        const anyPerson = await session.run(
          `MATCH (p:Person)
           OPTIONAL MATCH (p)-[r]-(n)
           RETURN p, collect({rel: type(r), dir: CASE WHEN startNode(r) = p THEN 'out' ELSE 'in' END, node: properties(n), labels: labels(n)}) as connections
           LIMIT 1`,
        );
        if (anyPerson.records.length === 0) return { profile: null };
        return formatProfile(anyPerson.records[0]);
      }

      return formatProfile(selfResult.records[0]);
    } finally {
      await session.close();
    }
  }

  async queryGraph(cypher: string): Promise<unknown[]> {
    const session = this.getSession();
    try {
      const result = await session.run(cypher);
      return result.records.map(r => r.toObject());
    } finally {
      await session.close();
    }
  }

  async getStats(): Promise<{ nodeCounts: Record<string, number>; relationshipCount: number }> {
    const session = this.getSession();
    try {
      const nodeResult = await session.run(
        `CALL db.labels() YIELD label
         CALL {
           WITH label
           MATCH (n)
           WHERE label IN labels(n)
           RETURN count(n) AS cnt
         }
         RETURN label, cnt`,
      );

      const nodeCounts: Record<string, number> = {};
      for (const record of nodeResult.records) {
        const label = record.get('label') as string;
        const count = record.get('cnt');
        nodeCounts[label] = typeof count === 'object' && count !== null && 'toNumber' in count
          ? (count as { toNumber(): number }).toNumber()
          : Number(count);
      }

      const relResult = await session.run(
        `MATCH ()-[r]->() RETURN count(r) as cnt`,
      );
      const relCount = relResult.records[0]?.get('cnt');
      const relationshipCount = typeof relCount === 'object' && relCount !== null && 'toNumber' in relCount
        ? (relCount as { toNumber(): number }).toNumber()
        : Number(relCount ?? 0);

      return { nodeCounts, relationshipCount };
    } finally {
      await session.close();
    }
  }

  async clearAll(): Promise<void> {
    const session = this.getSession();
    try {
      await session.run('MATCH (n) DETACH DELETE n');
      logger.info('Cleared all Neo4j data');
    } finally {
      await session.close();
    }
  }
}

function formatProfile(record: { get(key: string): unknown }): Record<string, unknown> {
  const person = (record.get('p') as { properties: Record<string, unknown> }).properties;
  const connections = record.get('connections') as Array<{
    rel: string;
    dir: string;
    node: Record<string, unknown>;
    labels: string[];
  }>;

  const grouped: Record<string, unknown[]> = {};
  for (const conn of connections) {
    if (!conn.node) continue;
    const key = conn.rel;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push({
      ...conn.node,
      _labels: conn.labels,
      _direction: conn.dir,
    });
  }

  return { person, connections: grouped };
}

function sanitizeKey(key: string): string {
  return key.replace(/[^a-zA-Z0-9_]/g, '_');
}

function sanitizeRelType(type: string): string {
  return type.replace(/[^a-zA-Z0-9_]/g, '_').toUpperCase();
}
