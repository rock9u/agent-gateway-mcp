# MCP Unified Gateway

A unified gateway server that routes MCP (Model Context Protocol) requests to multiple backend MCP servers. Built with [Hono](https://hono.dev/) and deployable to [Cloudflare Workers](https://developers.cloudflare.com/workers/).

## Features

- **Multi-Server Routing**: Automatically route tool calls to the appropriate MCP server
- **Multiple Transport Types**: Support for stdio, HTTP, and SSE (Server-Sent Events) backends
- **Code Pattern Validation**: Built-in validation and enforcement of code patterns
- **Timestamp Tracking**: Automatic timestamping of all requests and responses
- **Edge-Ready**: Runs on Cloudflare Workers or any edge runtime that supports Hono

## Architecture

The gateway acts as a reverse proxy that:
1. Receives MCP requests from clients (like Claude Code)
2. Identifies which backend server should handle the request based on tool name patterns
3. Routes the request to the appropriate backend server (stdio process, HTTP endpoint, or SSE stream)
4. Returns the response to the client

```
┌─────────────┐          ┌──────────────────┐          ┌─────────────────┐
│ MCP Client  │  HTTP    │  Unified Gateway │  stdio   │  Serena MCP     │
│ (Claude)    │─────────▶│  (Hono Server)   │─────────▶│  Server         │
└─────────────┘          │                  │          └─────────────────┘
                         │                  │  HTTP    ┌─────────────────┐
                         │                  │─────────▶│  Figma MCP      │
                         │                  │          │  Server         │
                         │                  │          └─────────────────┘
                         │                  │  HTTP    ┌─────────────────┐
                         │                  │─────────▶│  Context7 MCP   │
                         └──────────────────┘          │  Server         │
                                                        └─────────────────┘
```

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Start the Gateway

```bash
npm start
# Server runs on http://localhost:3000
```

### 3. Test the Gateway

```bash
# Check status
curl http://localhost:3000/gateway/status

# Health check
curl http://localhost:3000/health
```

## Gateway Endpoints

### Main Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Welcome message and API documentation |
| `/mcp` | POST | Main MCP endpoint with auto-routing |
| `/gateway/:server` | POST | Route to specific server |
| `/gateway/status` | GET | View all configured servers |
| `/health` | GET | Health check |

### `/mcp` Endpoint (Recommended)

The `/mcp` endpoint automatically routes requests to the appropriate backend server based on tool name patterns.

**Example MCP Request:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "mcp__serena__find_symbol",
    "arguments": {
      "name_path_pattern": "MyClass"
    }
  }
}
```

The gateway will automatically detect that `mcp__serena__*` tools should be routed to the Serena server.

## Integration with MCP Clients

### Claude Code Integration

Add the gateway to your Claude Code configuration:

**macOS/Linux:**
```bash
# Edit: ~/Library/Application Support/Claude/claude_desktop_config.json (macOS)
# Or: ~/.config/Claude/claude_desktop_config.json (Linux)
```

**Windows:**
```bash
# Edit: %APPDATA%\Claude\claude_desktop_config.json
```

**Configuration:**
```json
{
  "mcpServers": {
    "unified-gateway": {
      "url": "http://localhost:3000/mcp",
      "transport": "streamable-http"
    }
  }
}
```

After saving, restart Claude Code. The gateway will automatically route tool calls to the appropriate backend servers.

### Other MCP Clients

Any MCP client that supports Streamable HTTP transport can connect to the gateway:

```javascript
// Example using MCP SDK
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const transport = new StreamableHTTPClientTransport({
  url: 'http://localhost:3000/mcp'
});
```

## Adding New MCP Servers

To add a new backend MCP server, edit the `servers` object in `src/index.ts`:

### Example 1: HTTP Server

```typescript
const servers: Record<string, ServerConfig> = {
  // ... existing servers ...

  'my-custom-server': {
    type: 'http',
    url: 'https://my-server.example.com/mcp',
    tools: ['custom_*'], // Match all tools starting with "custom_"
    apiKey: 'optional-api-key' // Optional authentication
  }
};
```

### Example 2: Stdio Server

```typescript
const servers: Record<string, ServerConfig> = {
  // ... existing servers ...

  'python-tools': {
    type: 'stdio',
    command: 'python',
    args: ['-m', 'my_mcp_server'],
    tools: ['python_analyze', 'python_format']
  }
};
```

### Example 3: SSE Server

```typescript
const servers: Record<string, ServerConfig> = {
  // ... existing servers ...

  'streaming-server': {
    type: 'sse',
    url: 'https://streaming.example.com/mcp',
    tools: ['stream_*']
  }
};
```

### Tool Matching Patterns

The `tools` array supports two patterns:

1. **Exact match**: `'ping'` matches only the tool named "ping"
2. **Wildcard match**: `'mcp__serena__*'` matches all tools starting with "mcp__serena__"

## Pre-Configured Servers

The gateway comes with several pre-configured servers:

| Server | Type | Tools | Description |
|--------|------|-------|-------------|
| `serena` | stdio | `mcp__serena__*` | Code analysis and refactoring tools |
| `figma-remote` | http | `figma_*` | Figma design tools |
| `cloudflare-docs` | http | `mcp__cloudflare-docs__*` | Cloudflare documentation |
| `context7` | http | `mcp__context7__*` | Library documentation lookup |
| `my-mcp` | http | `ping`, `start-notification-stream` | Example local server |

View all configured servers:
```bash
curl http://localhost:3000/gateway/status
```

## Code Pattern Validation

The gateway includes built-in validation for common patterns:

1. **Arguments must be objects**: Ensures tool arguments are properly structured
2. **Relative path enforcement**: Serena tools require relative paths, not absolute
3. **Required parameters**: Validates required parameters for specific tools
4. **Timestamp metadata**: Automatically adds validation timestamps

## Development

### Local Development

```bash
npm run dev
# Server runs on http://localhost:3000 with hot reload
```

### Testing with MCP Example Client

In one terminal:
```bash
npm start
```

In another terminal:
```bash
node node_modules/@modelcontextprotocol/sdk/dist/esm/examples/client/simpleStreamableHttp.js
```

Commands in the example client:
```
> connect http://localhost:3000/mcp
> list-tools
> call-tool ping
```

## Deployment

### Deploy to Cloudflare Workers

```bash
npm run deploy
```

After deployment, update your MCP client configuration to use the Cloudflare Workers URL:

```json
{
  "mcpServers": {
    "unified-gateway": {
      "url": "https://your-worker.workers.dev/mcp",
      "transport": "streamable-http"
    }
  }
}
```

### Configuration for Cloudflare Workers

The `wrangler.jsonc` file includes:

- **Entry point**: `src/index.ts`
- **Compatibility**: `nodejs_compat` flag for Node.js stream APIs
- **Bundle optimization**: Aliases unused dependencies to reduce bundle size

## Monitoring and Debugging

All requests are logged with timestamps:

```
[2025-01-15T10:30:45.123Z] [Gateway] Request received
[2025-01-15T10:30:45.125Z] Matched tool 'mcp__serena__find_symbol' to server 'serena'
[2025-01-15T10:30:45.126Z] [stdio] Spawning uvx --from git+https://github.com/oraios/serena...
[2025-01-15T10:30:45.789Z] [stdio] Process completed with code 0
[2025-01-15T10:30:45.790Z] [Gateway] Request completed
```

Check logs:
- **Local**: Console output in terminal
- **Cloudflare Workers**: View in Cloudflare dashboard under Workers & Pages → Your Worker → Logs

## Troubleshooting

### Server Not Found

**Error**: `No server found for tool 'my_tool'`

**Solution**: Add the tool pattern to a server's `tools` array in `src/index.ts`:
```typescript
'my-server': {
  type: 'http',
  url: 'http://localhost:3000/mcp',
  tools: ['my_tool', 'other_tool']
}
```

### Validation Failed

**Error**: `Code pattern validation failed: Serena tools require relative paths`

**Solution**: Use relative paths instead of absolute paths:
```javascript
// ❌ Wrong
{ relative_path: '/Users/name/project/file.ts' }

// ✅ Correct
{ relative_path: 'src/file.ts' }
```

### Stdio Server Timeout

**Error**: `Request timeout`

**Solution**:
- Check that the stdio command is correct and executable
- Ensure the server responds within 30 seconds
- Check stderr logs for errors

## API Reference

### ServerConfig Interface

```typescript
interface ServerConfig {
  type: 'stdio' | 'http' | 'sse';
  command?: string;      // For stdio: command to execute
  args?: string[];       // For stdio: command arguments
  url?: string;          // For http/sse: endpoint URL
  apiKey?: string;       // Optional: API key for authentication
  tools?: string[];      // Tool name patterns to match
}
```

## License

MIT

## Contributing

Contributions are welcome! Please ensure your changes:
1. Follow the existing code style
2. Include appropriate error handling
3. Add logging for debugging
4. Update documentation

## Resources

- [MCP Documentation](https://modelcontextprotocol.io/)
- [Hono Documentation](https://hono.dev/)
- [Cloudflare Workers](https://developers.cloudflare.com/workers/)
