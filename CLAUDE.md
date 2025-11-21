# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a stateless MCP (Model Context Protocol) server built with Hono and deployed to Cloudflare Workers. It demonstrates how to create an MCP server using Streamable HTTP transport, adapted from the official Express example to work with Hono and Cloudflare's edge runtime.

## Key Technologies

- **Hono**: Lightweight web framework for edge runtimes
- **MCP SDK**: `@modelcontextprotocol/sdk` for Model Context Protocol implementation
- **fetch-to-node**: Converts Hono's fetch-based Request/Response to Node.js streams using `toReqRes()` and `toFetchResponse()`
- **Zod**: Runtime schema validation for tool parameters
- **Cloudflare Workers**: Deployment target (via Wrangler)

## Development Commands

```bash
# Start local development server (runs on port 3000)
npm start
# or
npm run dev

# Deploy to Cloudflare Workers
npm run deploy

# Generate TypeScript types for Cloudflare Workers
npm run cf-typegen
```

## Testing the Server

Start the server in one terminal:
```bash
npm start
```

In another terminal, test with the MCP example client:
```bash
node node_modules/@modelcontextprotocol/sdk/dist/esm/examples/client/simpleStreamableHttp.js
```

Then use commands like `connect http://localhost:3000/mcp`, `list-prompts`, `list-tools`, or `call-tool start-notification-stream`.

## Architecture

### Core Structure

- **`src/index.ts`**: Main application entry point containing:
  - `getServer()`: Factory function that creates a new McpServer instance with registered capabilities
  - Hono app with POST/GET/DELETE endpoints at `/mcp`
  - MCP server instantiation and transport handling per request

### MCP Server Pattern (Stateless)

Each request creates a fresh server instance via `getServer()`:
1. Creates new `McpServer` instance
2. Registers prompts, tools, and resources
3. Creates `StreamableHTTPServerTransport` with no session management
4. Connects transport to server
5. Handles request and converts Node.js streams back to fetch Response
6. Cleans up server and transport on connection close

### Key Conversion Pattern

Hono uses Web Standard Request/Response (fetch API), but MCP SDK expects Node.js streams:
```typescript
const { req, res } = toReqRes(c.req.raw);  // Convert to Node.js streams
await transport.handleRequest(req, res, await c.req.json());
return toFetchResponse(res);  // Convert back to fetch Response
```

### Registered MCP Capabilities

- **Prompt**: `greeting-template` - Takes a name parameter and generates a greeting message
- **Tool**: `start-notification-stream` - Sends periodic notifications with configurable interval/count (for testing resumability)
- **Tool**: `ping` - Simple health check tool that logs access and responds with "pong"
- **Resource**: `greeting-resource` - Provides a static greeting at `https://example.com/greetings/default`

## Configuration

### wrangler.jsonc

- Main entry: `src/index.ts`
- Dev server runs on port 3000
- Compatibility flags: `nodejs_compat` (required for Node.js stream APIs)
- Bundle optimization: Aliases unused dependencies (`raw-body`, `content-type`) to `src/empty.ts` to reduce bundle size by ~60%

### Bundle Optimization Note

The `alias` configuration in `wrangler.jsonc` maps unused dependencies to an empty file. This is safe because `fetch-to-node` gracefully handles missing optional dependencies.

## Important Implementation Details

- **Stateless design**: No session persistence between requests; `sessionIdGenerator: undefined`
- **Error handling**: Both transport and server have `onerror` handlers for debugging
- **Logging**: Request lifecycle events logged to console (useful for Cloudflare Workers logs)
- **Method restrictions**: Only POST is allowed on `/mcp` endpoint; GET/DELETE return 405 Method Not Allowed
