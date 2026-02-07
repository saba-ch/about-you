# About You

A personal knowledge system that scans your files, extracts facts about you using Claude, and stores them in a knowledge graph. Exposed as an MCP server so any LLM can query what it knows about you.

## How it works

1. You point it at a directory (e.g. your home folder)
2. A Claude agent autonomously explores — globbing, grepping, reading files, looking at images, checking app data
3. It extracts entities (people, skills, organizations, projects) and relationships into structured XML
4. Results are stored in Neo4j (graph) + LanceDB (vector search)
5. An MCP server exposes tools for any LLM to query your personal knowledge graph

## Setup

### Prerequisites

- Node.js 18+
- Docker (for Neo4j)

### Install

```bash
git clone <repo>
cd about-you
npm install
```

### Start Neo4j

```bash
docker run -d --name neo4j \
  -p 7474:7474 -p 7687:7687 \
  -e NEO4J_AUTH=neo4j/password \
  neo4j:community
```

### Configure (optional)

Copy and edit the config if you want to change defaults:

```bash
cp config.default.yaml config.yaml
```

Or set environment variables in `.env`:

```bash
cp .env.example .env
```

## Usage

### Scan your files

```bash
# Scan your home directory
npx tsx src/index.ts scan ~

# Scan specific directories
npx tsx src/index.ts scan ~/Documents ~/Projects

# Preview what directories would be scanned
npx tsx src/index.ts scan --dry-run ~
```

The agent will explore autonomously — reading files, checking images, digging into app data (Chrome bookmarks, git config, shell history, etc). You'll see live progress:

```
[turn 3] Glob: **/*.md
[turn 5] Reading: /Users/you/.gitconfig
[turn 5] Extracted! Running totals: 3 entities, 2 memories
[turn 8] Reading: /Users/you/Documents/resume.pdf
[turn 12] Grep: "saba" in .
...
Agent done: 191 turns, 47 files read, 89 tool calls, $0.9206
```

### Check what was found

```bash
npx tsx src/index.ts status
```

Or open the Neo4j browser at http://localhost:7474 and run:

```cypher
-- See everything
MATCH (n) RETURN n LIMIT 200

-- See your profile and connections
MATCH (p:Person)-[r]-(n) RETURN p, r, n

-- See all your skills
MATCH (p:Person)-[:SKILLED_IN]->(s:Skill) RETURN p.name, s.name

-- See work history
MATCH (p:Person)-[r:WORKS_AT]->(o:Organization) RETURN p.name, o.name, r.role, r.since
```

### Start the MCP server

```bash
npx tsx src/index.ts serve
```

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "about-you": {
      "command": "npx",
      "args": ["tsx", "/path/to/about-you/src/index.ts", "serve"]
    }
  }
}
```

Or to Claude Code's MCP settings. Then ask Claude things like:

- "What do you know about me?"
- "What skills do I have?"
- "Where have I worked?"
- "What are my interests?"

### Available MCP tools

| Tool | Description |
|------|-------------|
| `search_memories` | Semantic search over extracted memories |
| `query_graph` | Run a Cypher query against the knowledge graph |
| `get_entity` | Get all facts about a specific entity |
| `get_relationships` | Find connections from/to an entity |
| `get_profile` | High-level summary of the user |
| `add_memory` | Manually add a fact |

### Reset everything

```bash
npx tsx src/index.ts reset
```

## What it extracts

The agent looks at:

- **Documents**: resumes, notes, journals, READMEs, cover letters
- **Code**: project structure, package.json author fields, git configs
- **App data**: Chrome bookmarks, shell history, SSH config, VS Code settings, Spotify prefs
- **Images**: photos, screenshots, profile pictures
- **Configs**: .gitconfig, .npmrc, .aws/config

And builds a graph with:

- **People** you know and your relationship to them
- **Organizations** you've worked at or studied at
- **Skills** (technical, soft, languages)
- **Projects** you've built
- **Interests** and hobbies
- **Locations** you've lived or visited
- **Memories** — specific facts and preferences

## Architecture

```
CLI (scan/serve/status/reset)
       │
       ├── scan → Claude Agent (Glob/Grep/Read, 1000 turns)
       │              │
       │              ├── Explores filesystem autonomously
       │              ├── Reads interesting files + images
       │              └── Returns <extraction> XML
       │
       ├── Storage: Neo4j (graph) + LanceDB (vectors)
       │
       └── serve → MCP Server (stdio) → 6 tools + 3 resources
```
