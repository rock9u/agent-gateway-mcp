# Quick Start Guide - Unified Gateway

**Created:** ${new Date().toISOString()}

## 🚀 Getting Started in 3 Steps

### Step 1: Start the Gateway

```bash
npm run start:gateway
```

This starts the unified gateway on **port 3001** (the original MCP server on port 3000 is unaffected).

### Step 2: Test Health

```bash
curl http://localhost:3001/health
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "servers": ["serena", "figma-remote", "cloudflare-docs", "context7", "my-mcp"],
  "message": "Health check complete desu: 2024-01-15T10:30:00.000Z"
}
```

### Step 3: Call a Tool

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

Expected response:
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [{
      "type": "text",
      "text": "pong desu: 2024-01-15T10:30:00.000Z"
    }]
  }
}
```

## 📋 Available Commands

| Command | Description | Port |
|---------|-------------|------|
| `npm run start:gateway` | Start unified gateway | 3001 |
| `npm run dev:gateway` | Same as start:gateway | 3001 |
| `npm run deploy:gateway` | Deploy to Cloudflare Workers | - |
| `npm run test:gateway` | Run test suite | - |
| `npm start` | Start original MCP server | 3000 |

## 🎯 Key Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/gateway/:server?` | POST/GET/DELETE | Main routing endpoint |
| `/mcp` | POST | Local MCP server |
| `/health` | GET | Health check |
| `/gateway/status` | GET | Gateway status |

## ⚡ Quick Examples

### Example 1: Auto-Route Tool Call

The gateway automatically detects which server to route to based on the tool name:

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

Tool name `mcp__serena__find_symbol` automatically routes to the **serena** server (stdio).

### Example 2: Direct Server Selection

```bash
curl -X POST http://localhost:3001/gateway/my-mcp \
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

Explicitly routes to the **my-mcp** server.

### Example 3: Gateway Status

```bash
curl http://localhost:3001/gateway/status
```

Shows all registered servers and their tool counts.

## 🔍 Debugging

### Check Logs

The gateway logs all operations with timestamps:

```
[2024-01-15T10:30:00.000Z] [Gateway] Request received
[2024-01-15T10:30:00.123Z] [Gateway] Enforcing code-pattern for tool: ping
[2024-01-15T10:30:00.234Z] [code-pattern] ✓ Validated ping
[2024-01-15T10:30:00.345Z] [Gateway] Matched tool 'ping' to server 'my-mcp'
```

### Run Test Suite

```bash
npm run test:gateway
```

Runs 6 comprehensive tests:
1. ✅ Health check
2. ✅ Gateway status
3. ✅ Local MCP ping
4. ✅ Code pattern validation
5. ✅ Timestamp format
6. ✅ Method not allowed

### Common Issues

**Issue:** `Server not found`
```bash
# Solution: Check available servers
curl http://localhost:3001/gateway/status
```

**Issue:** `Code pattern validation failed`
```bash
# Solution: Check validation rules in UNIFIED-GATEWAY.md
# Most common: Use relative paths, not absolute paths
```

**Issue:** Gateway not responding
```bash
# Solution: Ensure gateway is running on port 3001
lsof -i :3001
```

## 📚 Documentation

| File | Description |
|------|-------------|
| `UNIFIED-GATEWAY.md` | Complete documentation |
| `ARCHITECTURE.md` | System architecture diagrams |
| `IMPLEMENTATION-SUMMARY.md` | What was built and why |
| `QUICKSTART.md` | This file |

## 🛠️ Configuration

### Add a New Server

Edit `src/unified-gateway.ts`:

```typescript
const servers: Record<string, ServerConfig> = {
  'your-server': {
    type: 'http',
    url: 'https://your-server.com/mcp',
    tools: ['your_tool_*']
  }
};
```

### Customize Validation Rules

Edit the `validateCodePattern` function in `src/unified-gateway.ts`.

## 📦 Production Deployment

### Deploy to Cloudflare Workers

```bash
npm run deploy:gateway
```

Your gateway will be available at:
```
https://mcp-unified-gateway.workers.dev
```

### Environment Variables (if needed)

Add to `wrangler.unified.jsonc`:

```jsonc
{
  "vars": {
    "API_KEY": "your-api-key",
    "LOG_LEVEL": "info"
  }
}
```

## 🧪 Testing with MCP Client

### Using the Official SDK Client

```bash
# In terminal 1: Start gateway
npm run start:gateway

# In terminal 2: Start MCP client
node node_modules/@modelcontextprotocol/sdk/dist/esm/examples/client/simpleStreamableHttp.js
```

Then in the client:
```
connect http://localhost:3001/gateway
list-tools
call-tool ping
```

## 🔐 Security Notes

1. **DNS Rebinding Protection:** Disabled by default for local development
2. **Authentication:** No auth by default, add via middleware
3. **Rate Limiting:** Not implemented, add if needed
4. **CORS:** Not configured, add if needed for web clients

## 🎨 Timestamp Pattern

All responses follow the "desu" pattern:

```
"Your prompt is complete desu: 2024-01-15T10:30:00.000Z"
```

This ensures:
- ✅ Every operation has a clear timestamp
- ✅ Completion messages are easily identifiable
- ✅ Debugging and auditing are simplified

## 💡 Pro Tips

1. **Use auto-routing** for simpler requests: `/gateway/auto`
2. **Check health first** before debugging: `curl /health`
3. **Watch logs** for detailed operation flow
4. **Run tests** after configuration changes: `npm run test:gateway`
5. **Read error messages** - they include helpful timestamps

## 📞 Support

For issues or questions:
1. Check `UNIFIED-GATEWAY.md` for detailed documentation
2. Review `ARCHITECTURE.md` for system understanding
3. Read `IMPLEMENTATION-SUMMARY.md` for design decisions
4. Run `npm run test:gateway` to verify setup

## 🎯 Next Steps

1. ✅ Start the gateway: `npm run start:gateway`
2. ✅ Test basic functionality: `curl /health`
3. ✅ Run test suite: `npm run test:gateway`
4. ✅ Try example requests above
5. ✅ Read full documentation: `UNIFIED-GATEWAY.md`
6. ✅ Deploy to production: `npm run deploy:gateway`

---

**Your prompt is complete desu:** ${new Date().toISOString()}
