# Unified Gateway Architecture

**Document Created:** ${new Date().toISOString()}

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT                                   │
│                    (MCP Client / cURL)                          │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         │ HTTP/HTTPS Request
                         │
┌────────────────────────▼────────────────────────────────────────┐
│                   HONO APPLICATION                               │
│                  (Cloudflare Workers)                            │
│                                                                  │
│  ┌────────────────────────────────────────────────────────┐   │
│  │          Code-Pattern Middleware                        │   │
│  │  • Timestamp injection                                  │   │
│  │  • Validation rules                                     │   │
│  │  • Metadata enrichment                                  │   │
│  └──────────────┬─────────────────────────────────────────┘   │
│                 │                                               │
│  ┌──────────────▼──────────────────────────────────────────┐  │
│  │          Routing Engine                                  │  │
│  │  • Auto-detect server by tool name                      │  │
│  │  • Wildcard matching (mcp__serena__*)                   │  │
│  │  • Manual server selection                              │  │
│  └──────────────┬──────────────────────────────────────────┘  │
│                 │                                               │
│                 ├──────────┬──────────┬──────────┐            │
└─────────────────┼──────────┼──────────┼──────────┼────────────┘
                  │          │          │          │
        ┌─────────▼───┐  ┌──▼──────┐ ┌▼────────┐ │
        │   Stdio     │  │  HTTP   │ │  SSE    │ │
        │  Handler    │  │ Handler │ │ Handler │ │
        └─────────┬───┘  └──┬──────┘ └┬────────┘ │
                  │         │         │          │
    ┌─────────────▼─────────▼─────────▼──────────▼─────────────┐
    │                 TARGET MCP SERVERS                         │
    │                                                            │
    │  ┌─────────┐  ┌──────────┐  ┌──────────────┐            │
    │  │ Serena  │  │ Context7 │  │ Cloudflare   │            │
    │  │ (stdio) │  │  (http)  │  │ Docs (http)  │   ...      │
    │  └─────────┘  └──────────┘  └──────────────┘            │
    └────────────────────────────────────────────────────────────┘
```

## Request Flow Diagram

```
┌───────┐
│Client │
└───┬───┘
    │
    │ 1. POST /gateway/auto
    │    { method: "tools/call", params: { name: "mcp__serena__find_symbol" } }
    │
    ▼
┌───────────────────────┐
│ Code-Pattern          │
│ Middleware            │
│                       │
│ [timestamp] Request   │◄── getTimestamp()
│ [timestamp] Validate  │
│ [timestamp] Inject    │
└─────────┬─────────────┘
          │
          │ 2. Validation passed
          │    + metadata injected
          │
          ▼
┌───────────────────────┐
│ Routing Engine        │
│                       │
│ findServerForTool()   │──► "mcp__serena__*" → serena (stdio)
│                       │
│ [timestamp] Matched   │
└─────────┬─────────────┘
          │
          │ 3. Route to stdio handler
          │
          ▼
┌───────────────────────┐
│ Stdio Handler         │
│                       │
│ spawn(uvx, [...])     │──► spawns Serena process
│ [timestamp] Spawning  │
│ proc.stdin.write()    │──► sends JSON-RPC
│ proc.stdout.on()      │──► receives response
│ [timestamp] Complete  │
└─────────┬─────────────┘
          │
          │ 4. Response with timestamp
          │
          ▼
┌───────────────────────┐
│ Response              │
│                       │
│ {                     │
│   result: {...},      │
│   timestamp: "..."    │◄── createCompletionMessage()
│ }                     │
└─────────┬─────────────┘
          │
          ▼
      ┌───────┐
      │Client │
      └───────┘
```

## Timestamp Flow

Every operation includes timestamps:

```
Request Start
    │
    ├─► [2024-01-15T10:30:00.000Z] [Gateway] Request received
    │
    ├─► [2024-01-15T10:30:00.123Z] [Gateway] Enforcing code-pattern for tool: ping
    │   │
    │   └─► [2024-01-15T10:30:00.234Z] [code-pattern] ✓ Validated ping
    │
    ├─► [2024-01-15T10:30:00.345Z] [Gateway] Matched tool 'ping' to server 'my-mcp'
    │
    ├─► [2024-01-15T10:30:00.456Z] [http] Proxying to http://localhost:3000/mcp
    │   │
    │   └─► [2024-01-15T10:30:00.567Z] [MCP] Ping tool called
    │
    ├─► [2024-01-15T10:30:00.678Z] [http] Request completed with status 200
    │
    └─► [2024-01-15T10:30:00.789Z] [Gateway] Request completed

Response: "pong desu: 2024-01-15T10:30:00.789Z"
```

## Component Interaction

```
┌─────────────────────────────────────────────────────────────┐
│                    TIMESTAMP UTILITIES                       │
│  getTimestamp() | createCompletionMessage() | logWithTimestamp() │
└─────────────────────────┬───────────────────────────────────┘
                          │ Used by all components
                          │
        ┌─────────────────┼─────────────────┐
        │                 │                 │
┌───────▼────────┐  ┌────▼──────────┐  ┌──▼──────────────┐
│  Middleware    │  │  Handlers     │  │  MCP Server     │
│                │  │               │  │                 │
│ • Validation   │  │ • Stdio       │  │ • Tools         │
│ • Metadata     │  │ • HTTP        │  │ • Prompts       │
│ • Logging      │  │ • SSE         │  │ • Resources     │
└───────┬────────┘  └────┬──────────┘  └──┬──────────────┘
        │                │                │
        │                │                │
        └────────────────┼────────────────┘
                         │
                ┌────────▼─────────┐
                │  Server Registry │
                │                  │
                │ • serena         │
                │ • figma-remote   │
                │ • cloudflare-docs│
                │ • context7       │
                │ • my-mcp         │
                └──────────────────┘
```

## Validation Pipeline

```
Tool Call Request
    │
    ▼
┌─────────────────────────┐
│ Skip validation?        │
│ • initialize method     │──Yes──► Continue
│ • tools/list method     │
└───────┬─────────────────┘
        │ No
        ▼
┌─────────────────────────┐
│ Rule 1: Type Check      │
│ Arguments must be       │──Fail──► 400 Error
│ object, not primitive   │        "Arguments must be an object desu: [timestamp]"
└───────┬─────────────────┘
        │ Pass
        ▼
┌─────────────────────────┐
│ Rule 2: Serena Paths    │
│ Must use relative paths │──Fail──► 400 Error
│ not absolute            │        "Serena tools require relative paths desu: [timestamp]"
└───────┬─────────────────┘
        │ Pass
        ▼
┌─────────────────────────┐
│ Rule 3: Context7 Params │
│ get-library-docs needs  │──Fail──► 400 Error
│ context7CompatibleLibraryID │   "Context7 get-library-docs requires parameter desu: [timestamp]"
└───────┬─────────────────┘
        │ Pass
        ▼
┌─────────────────────────┐
│ Rule 4: Inject Metadata │
│ {                       │
│   ...originalArgs,      │
│   _metadata: {          │
│     validation_timestamp│
│     pattern_enforced    │
│   }                     │
│ }                       │
└───────┬─────────────────┘
        │
        ▼
    Routing Engine
```

## Server Registry Structure

```typescript
interface ServerConfig {
  type: 'stdio' | 'http' | 'sse'
  command?: string        // For stdio
  args?: string[]         // For stdio
  url?: string           // For http/sse
  apiKey?: string        // For http/sse
  tools?: string[]       // Tool name patterns
}
```

```
servers
│
├── serena
│   ├── type: "stdio"
│   ├── command: "uvx"
│   ├── args: ["--from", "git+...", ...]
│   └── tools: ["mcp__serena__*"]
│
├── figma-remote
│   ├── type: "http"
│   ├── url: "https://mcp.figma.com/mcp"
│   └── tools: ["figma_*"]
│
├── cloudflare-docs
│   ├── type: "http"
│   ├── url: "https://docs.mcp.cloudflare.com/mcp"
│   └── tools: ["mcp__cloudflare-docs__*"]
│
├── context7
│   ├── type: "http"
│   ├── url: "https://mcp.context7.com/mcp"
│   └── tools: ["mcp__context7__*"]
│
└── my-mcp
    ├── type: "http"
    ├── url: "http://localhost:3000/mcp"
    └── tools: ["ping", "start-notification-stream"]
```

## Transport Handler Selection

```
                      Transport Type?
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
    ┌───▼────┐         ┌────▼────┐        ┌────▼────┐
    │ stdio  │         │  http   │        │   sse   │
    └───┬────┘         └────┬────┘        └────┬────┘
        │                   │                   │
        ▼                   ▼                   ▼
┌───────────────┐    ┌──────────────┐   ┌──────────────┐
│ Spawn Process │    │  Fetch API   │   │  Streaming?  │
│ • command     │    │  POST        │   │   Yes → SSE  │
│ • args        │    │  JSON body   │   │   No → HTTP  │
│ • stdio pipes │    │  auth headers│   └──────────────┘
│ • timeout 30s │    └──────────────┘
└───────────────┘
```

## Error Handling

```
Error Occurs
    │
    ▼
┌────────────────────────┐
│ getTimestamp()         │
│ Get current time       │
└──────────┬─────────────┘
           │
           ▼
┌────────────────────────┐
│ createCompletionMessage│
│ "Error message desu:   │
│  [timestamp]"          │
└──────────┬─────────────┘
           │
           ▼
┌────────────────────────┐
│ logErrorWithTimestamp  │
│ Console.error with     │
│ timestamp prefix       │
└──────────┬─────────────┘
           │
           ▼
┌────────────────────────┐
│ Return JSON-RPC Error  │
│ {                      │
│   jsonrpc: "2.0",      │
│   error: {             │
│     code: -32603,      │
│     message: "... desu:│
│              [...]"    │
│   },                   │
│   id: null             │
│ }                      │
└────────────────────────┘
```

## Performance Tracking

```typescript
// Example usage in code
const perf = trackPerformance("database query");

// ... do work ...

const result = perf.finish();
// Logs:
// [2024-01-15T10:30:00.000Z] database query started
// [2024-01-15T10:30:00.150Z] database query completed in 150ms

// Returns:
// {
//   startTime: "2024-01-15T10:30:00.000Z",
//   endTime: "2024-01-15T10:30:00.150Z",
//   durationMs: 150,
//   durationFormatted: "150ms"
// }
```

## Deployment Architecture

```
┌──────────────────────────────────────────────────────────┐
│                    Development                            │
│                                                           │
│  npm run start:gateway                                    │
│        │                                                  │
│        ▼                                                  │
│  Wrangler Dev Server (Port 3001)                         │
│        │                                                  │
│        └──► src/unified-gateway.ts                       │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│                    Production                             │
│                                                           │
│  npm run deploy:gateway                                   │
│        │                                                  │
│        ▼                                                  │
│  Cloudflare Workers                                       │
│        │                                                  │
│        └──► https://mcp-unified-gateway.workers.dev      │
└──────────────────────────────────────────────────────────┘
```

## Integration Points

```
┌─────────────────────────────────────────────────────────────┐
│                      External Systems                        │
│                                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌───────────┐ │
│  │  Serena  │  │ Context7 │  │Cloudflare│  │   Figma   │ │
│  │   MCP    │  │   MCP    │  │Docs MCP  │  │    MCP    │ │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └─────┬─────┘ │
│       │             │             │              │         │
└───────┼─────────────┼─────────────┼──────────────┼─────────┘
        │             │             │              │
        │             │             │              │
        └─────────────┴─────────────┴──────────────┘
                            │
                            │ HTTP/Stdio/SSE
                            │
                ┌───────────▼──────────┐
                │  Unified Gateway     │
                │  (This System)       │
                └───────────┬──────────┘
                            │
                ┌───────────▼──────────┐
                │  MCP Clients         │
                │  • Claude Desktop    │
                │  • Zed Editor        │
                │  • Custom Apps       │
                └──────────────────────┘
```

---

**Your prompt is complete desu:** ${new Date().toISOString()}
