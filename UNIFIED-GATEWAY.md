# Unified Gateway Documentation

## Overview

The Unified Gateway is an advanced MCP (Model Context Protocol) routing system built with Hono and deployed to Cloudflare Workers. It provides intelligent routing across multiple MCP servers with different transport types (stdio, HTTP, SSE) while enforcing code patterns and maintaining comprehensive timestamp tracking.

**Generated at:** ${new Date().toISOString()}

## Architecture

### Core Components

1. **Timestamp Utilities**
   - `getTimestamp()`: Returns ISO timestamp
   - `createCompletionMessage(msg)`: Adds "desu: timestamp" suffix
   - `logWithTimestamp(msg)`: Console logging with timestamps

2. **Server Registry**
   - Centralized configuration for all MCP servers
   - Support for stdio, HTTP, and SSE transports
   - Tool-based routing with wildcard matching

3. **Code-Pattern Enforcement**
   - Middleware-based validation
   - Timestamp metadata injection
   - Server-specific rule enforcement

4. **Transport Handlers**
   - `handleStdioRequest`: Spawns child processes
   - `handleHttpRequest`: HTTP proxy
   - `handleSseRequest`: Streaming support

## Endpoints

### `/gateway/:server?`
Main unified routing endpoint. Automatically detects target server based on tool name.

**Methods:** GET, POST, DELETE

**Parameters:**
- `server` (optional): Server name or "auto" for automatic routing

**Example Request:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "mcp__serena__find_symbol",
    "arguments": {
      "name_path": "MyClass",
      "relative_path": "src/index.ts"
    }
  }
}
```

### `/mcp`
Local stateless MCP server endpoint (original functionality).

**Methods:** POST

**Tools:**
- `ping`: Health check tool
- `start-notification-stream`: Periodic notifications

**Prompts:**
- `greeting-template`: Greeting message generator

**Resources:**
- `greeting-resource`: Static greeting

### `/health`
Health check endpoint returning server status and available servers.

**Method:** GET

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "servers": ["serena", "figma-remote", "cloudflare-docs", "context7", "my-mcp"],
  "message": "Health check complete desu: 2024-01-15T10:30:00.000Z"
}
```

### `/gateway/status`
Detailed gateway status including server configurations.

**Method:** GET

## Server Registry

Currently configured servers:

### serena (stdio)
- **Transport:** stdio
- **Command:** `uvx --from git+https://github.com/oraios/serena serena start-mcp-server --context ide-assistant --project /Users/rockgu/playground/serena`
- **Tools:** `mcp__serena__*` (all Serena tools)
- **Use Case:** Local code manipulation and symbolic operations

### figma-remote (HTTP)
- **Transport:** HTTP
- **URL:** https://mcp.figma.com/mcp
- **Tools:** `figma_*`
- **Use Case:** Figma design integration

### cloudflare-docs (HTTP)
- **Transport:** HTTP
- **URL:** https://docs.mcp.cloudflare.com/mcp
- **Tools:** `mcp__cloudflare-docs__*`
- **Use Case:** Cloudflare documentation search

### context7 (HTTP)
- **Transport:** HTTP
- **URL:** https://mcp.context7.com/mcp
- **Tools:** `mcp__context7__*`
- **Use Case:** Library documentation retrieval

### my-mcp (HTTP)
- **Transport:** HTTP
- **URL:** http://localhost:3000/mcp
- **Tools:** `ping`, `start-notification-stream`
- **Use Case:** Local testing and notifications

## Code-Pattern Enforcement

The gateway enforces the following code patterns:

### Rule 1: Type Safety
Arguments must be objects, not primitives.

### Rule 2: Serena Path Requirements
Serena tools must use relative paths, not absolute paths.

**Example:**
```typescript
// ✓ Valid
{ relative_path: "src/index.ts" }

// ✗ Invalid
{ relative_path: "/Users/user/project/src/index.ts" }
```

### Rule 3: Context7 Parameters
Context7 `get-library-docs` requires `context7CompatibleLibraryID`.

### Rule 4: Metadata Injection
All tool calls automatically receive validation timestamps:
```json
{
  "_metadata": {
    "validation_timestamp": "2024-01-15T10:30:00.000Z",
    "pattern_enforced": true
  }
}
```

## Timestamp Pattern

All responses and logs follow the "desu" pattern:

```
"Your prompt is complete desu: 2024-01-15T10:30:00.000Z"
```

This ensures:
1. Every operation has a clear timestamp
2. Completion messages are easily identifiable
3. Debugging and auditing are simplified

## Usage Examples

### Example 1: Call Serena Tool
```bash
curl -X POST http://localhost:3001/gateway/auto \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "mcp__serena__find_symbol",
      "arguments": {
        "name_path": "MyClass",
        "relative_path": "src/index.ts"
      }
    }
  }'
```

### Example 2: Health Check
```bash
curl http://localhost:3001/health
```

### Example 3: Ping Local Server
```bash
curl -X POST http://localhost:3001/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "ping",
      "arguments": {}
    }
  }'
```

## Configuration

To add a new server to the registry, edit `src/unified-gateway.ts`:

```typescript
const servers: Record<string, ServerConfig> = {
  'your-server': {
    type: 'http', // or 'stdio' or 'sse'
    url: 'https://your-server.com/mcp',
    tools: ['your_tool_*'], // Wildcard matching
    apiKey: process.env.YOUR_API_KEY // Optional
  }
};
```

## Development

### Start Gateway
```bash
npm start
# or
npm run dev
```

Default port: 3000 (configured in wrangler.jsonc)

### Deploy to Cloudflare Workers
```bash
npm run deploy
```

### Test with MCP Client
```bash
node node_modules/@modelcontextprotocol/sdk/dist/esm/examples/client/simpleStreamableHttp.js
```

Then use:
- `connect http://localhost:3000/gateway`
- `list-tools`
- `call-tool ping`

## Error Handling

All errors include timestamps in the "desu" format:

```json
{
  "jsonrpc": "2.0",
  "error": {
    "code": -32602,
    "message": "Code pattern validation failed: Arguments must be an object desu: 2024-01-15T10:30:00.000Z"
  }
}
```

## Logging

All operations are logged with timestamps:

```
[2024-01-15T10:30:00.000Z] [Gateway] Request received
[2024-01-15T10:30:00.123Z] [Gateway] Enforcing code-pattern for tool: ping
[2024-01-15T10:30:00.234Z] [code-pattern] ✓ Validated ping
[2024-01-15T10:30:00.345Z] [Gateway] Matched tool 'ping' to server 'my-mcp'
[2024-01-15T10:30:00.456Z] [http] Proxying to http://localhost:3000/mcp
[2024-01-15T10:30:00.567Z] [http] Request completed with status 200
[2024-01-15T10:30:00.678Z] [Gateway] Request completed
```

## Best Practices

1. **Always use relative paths** for Serena tools
2. **Resolve library IDs** before calling Context7 `get-library-docs`
3. **Check health endpoint** before making requests
4. **Monitor timestamps** in logs for debugging
5. **Use auto-routing** when tool name is unique

## Migration from index.ts

To migrate from the original `src/index.ts`:

1. Update your import:
   ```typescript
   // Old
   import app from './src/index.ts'

   // New
   import app from './src/unified-gateway.ts'
   ```

2. Update endpoint URLs:
   ```typescript
   // Old: Direct MCP access
   POST http://localhost:3000/mcp

   // New: Gateway routing
   POST http://localhost:3000/gateway/auto

   // Or keep using direct access (still supported)
   POST http://localhost:3000/mcp
   ```

3. No code changes required - backward compatible!

## Troubleshooting

### Issue: "Server not found"
- Check tool name matches registry
- Use `/gateway/status` to list available servers

### Issue: "Code pattern validation failed"
- Review validation rules in this document
- Check error message for specific rule violation

### Issue: "Request timeout"
- Stdio servers have 30s timeout
- Check server process logs
- Verify command and args in registry

---

**Your prompt is complete desu:** ${new Date().toISOString()}
