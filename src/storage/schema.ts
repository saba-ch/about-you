// Node labels for the knowledge graph
export const NodeLabels = {
  Person: 'Person',
  Organization: 'Organization',
  Project: 'Project',
  Skill: 'Skill',
  Interest: 'Interest',
  Location: 'Location',
  Event: 'Event',
  Preference: 'Preference',
  Memory: 'Memory',
  Topic: 'Topic',
} as const;

export type NodeLabel = (typeof NodeLabels)[keyof typeof NodeLabels];

// Relationship types
export const RelTypes = {
  KNOWS: 'KNOWS',
  WORKS_AT: 'WORKS_AT',
  STUDIED_AT: 'STUDIED_AT',
  SKILLED_IN: 'SKILLED_IN',
  INTERESTED_IN: 'INTERESTED_IN',
  WORKED_ON: 'WORKED_ON',
  LOCATED_IN: 'LOCATED_IN',
  ATTENDED: 'ATTENDED',
  HAS_PREFERENCE: 'HAS_PREFERENCE',
  REMEMBERS: 'REMEMBERS',
  RELATED_TO: 'RELATED_TO',
  ABOUT: 'ABOUT',
} as const;

export type RelType = (typeof RelTypes)[keyof typeof RelTypes];

// Entity as extracted from text
export interface ExtractedEntity {
  type: NodeLabel;
  name: string;
  properties: Record<string, string>;
}

// Relationship as extracted from text
export interface ExtractedRelationship {
  from: string;
  fromType: NodeLabel;
  type: RelType | string;
  to: string;
  toType: NodeLabel;
  properties: Record<string, string>;
}

// Constraints to ensure uniqueness
export const CONSTRAINTS = [
  `CREATE CONSTRAINT person_name IF NOT EXISTS FOR (p:Person) REQUIRE p.name IS UNIQUE`,
  `CREATE CONSTRAINT org_name IF NOT EXISTS FOR (o:Organization) REQUIRE o.name IS UNIQUE`,
  `CREATE CONSTRAINT skill_name IF NOT EXISTS FOR (s:Skill) REQUIRE s.name IS UNIQUE`,
  `CREATE CONSTRAINT interest_name IF NOT EXISTS FOR (i:Interest) REQUIRE i.name IS UNIQUE`,
  `CREATE CONSTRAINT location_name IF NOT EXISTS FOR (l:Location) REQUIRE l.name IS UNIQUE`,
  `CREATE CONSTRAINT topic_name IF NOT EXISTS FOR (t:Topic) REQUIRE t.name IS UNIQUE`,
  `CREATE CONSTRAINT project_name IF NOT EXISTS FOR (p:Project) REQUIRE p.name IS UNIQUE`,
];

// Valid node labels set for runtime validation
export const VALID_LABELS = new Set(Object.values(NodeLabels));
export const VALID_REL_TYPES = new Set(Object.values(RelTypes));
