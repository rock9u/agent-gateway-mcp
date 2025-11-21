import { Hono } from 'hono'
import { spawn } from 'child_process'
import { StreamableHTTPTransport } from '@hono/mcp'

const app = new Hono()

// Server registry with transport types
const servers = {
  'serena': {
    type: 'stdio',
    command: 'uvx',
    args: ['--from', 'git+https://github.com/oraios/serena', 'serena', 'start-mcp-server', '--context', 'ide-assistant', '--project', '/Users/rockgu/playground/serena'],
    tools: ['serena_tool_1', 'serena_tool_2'] // Register known tools
  },
  'figma-remote': {
    type: 'http',
    url: 'https://mcp.figma.com/mcp',
    tools: ['figma_*'] // Wildcard matching
  },
  'vercel': {
    type: 'http',
    url: 'https://mcp.vercel.com'
  },
  'cloudflare-docs': {
    type: 'http',
    url: 'https://docs.mcp.cloudflare.com/mcp'
  },
  'cloudflare-workers-binding': {
    type: 'http',
    url: 'https://bindings.mcp.cloudflare.com/mcp'
  },
  'cloudinary-asset-mgmt': {
    type: 'sse',
    url: 'https://asset-management.mcp.cloudinary.com/sse'
  },
  'cloudinary-env-config': {
    type: 'sse',
    url: 'https://environment-config.mcp.cloudinary.com/sse'
  },
  'cloudinary-smd': {
    type: 'sse',
    url: 'https://structured-metadata.mcp.cloudinary.com/sse'
  },
  'context7': {
    type: 'http',
    url: 'https://mcp.context7.com/mcp'
  },
  'figma-desktop': {
    type: 'http',
    url: 'http://127.0.0.1:3845/mcp'
  },
  'my-mcp': {
    type: 'http',
    url: 'http://localhost:3000/mcp'
  }
}

// Code-pattern enforcement middleware (runs first)
app.use('/mcp/*', async (c, next) => {
  const body = await c.req.json()

  // Skip enforcement for code-pattern tool itself
  if (body.method === 'tools/call' && body.params?.name !== 'code-pattern') {
    const toolName = body.params.name

    console.log(`[Gateway] Enforcing code-pattern for tool: ${toolName}`)

    // Wrap request in code-pattern validation
    const validationResult = await validateCodePattern({
      targetTool: toolName,
      targetServer: findServerForTool(toolName),
      originalArgs: body.params?.arguments || {}
    })

    if (!validationResult.valid) {
      return c.json({
        jsonrpc: '2.0',
        id: body.id,
        error: {
          code: -32602,
          message: `Code pattern validation failed: ${validationResult.error}`
        }
      }, 400)
    }

    // Store validated args for downstream routing
    c.set('validatedArgs', validationResult.transformedArgs)
  }

  await next()
})

// Unified MCP endpoint with routing
app.all('/mcp/:server?', async (c) => {
  const serverName = c.req.param('server') || 'auto'
  const body = await c.req.json()

  // Auto-detect target server based on tool name
  let targetServer = serverName === 'auto'
    ? findServerForTool(body.params?.name)
    : servers[serverName]

  if (!targetServer) {
    return c.json({
      jsonrpc: '2.0',
      id: body.id,
      error: { code: -32601, message: 'Server not found' }
    }, 404)
  }

  // Route based on transport type
  switch (targetServer.type) {
    case 'stdio':
      return handleStdioRequest(c, targetServer, body)
    case 'http':
      return handleHttpRequest(c, targetServer, body)
    case 'sse':
      return handleSseRequest(c, targetServer, body)
    default:
      return c.json({ error: 'Unknown transport type' }, 500)
  }
})

// Stdio handler: spawn process and manage communication
async function handleStdioRequest(c: any, server: any, body: any) {
  return new Promise((resolve) => {
    const proc = spawn(server.command, server.args, {
      stdio: ['pipe', 'pipe', 'pipe']
    })

    let responseData = ''

    proc.stdout.on('data', (data) => {
      responseData += data.toString()
    })

    proc.on('close', () => {
      try {
        const result = JSON.parse(responseData)
        resolve(c.json(result))
      } catch (e) {
        resolve(c.json({ error: 'Invalid JSON from stdio server' }, 500))
      }
    })

    proc.stderr.on('data', (data) => {
      console.error(`[stdio:${server.command}] ${data}`)
    })

    // Send request to stdin
    proc.stdin.write(JSON.stringify(body) + '\n')
    proc.stdin.end()

    // Timeout after 30 seconds
    setTimeout(() => {
      proc.kill()
      resolve(c.json({ error: 'Request timeout' }, 504))
    }, 30000)
  })
}

// HTTP handler: simple proxy
async function handleHttpRequest(c: any, server: any, body: any) {
  const response = await fetch(server.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(server)
    },
    body: JSON.stringify(body)
  })

  const result = await response.json()
  return c.json(result, response.status)
}

// SSE handler: proxy with streaming support
async function handleSseRequest(c: any, server: any, body: any) {
  // For SSE, if request needs streaming response
  if (body.method === 'notifications/subscribe' || body.method?.includes('stream')) {
    const response = await fetch(server.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
        ...getAuthHeaders(server)
      },
      body: JSON.stringify(body)
    })

    // Stream SSE response back to client
    return new Response(response.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
    })
  }

  // Regular JSON response
  return handleHttpRequest(c, server, body)
}

// Helper: Find server for tool
function findServerForTool(toolName: string | undefined): any {
  if (!toolName) return null

  for (const [name, server] of Object.entries(servers)) {
    if (server.tools) {
      // Check for exact match or wildcard
      const matches = server.tools.some((t: string) => {
        if (t.endsWith('*')) {
          return toolName.startsWith(t.slice(0, -1))
        }
        return t === toolName
      })

      if (matches) return server
    }
  }

  return null
}

// Helper: Get auth headers if needed
function getAuthHeaders(server: any) {
  if (server.apiKey) {
    return { 'Authorization': `Bearer ${server.apiKey}` }
  }
  return {}
}

// Code-pattern validation logic
async function validateCodePattern(context: any) {
  // Your validation rules here
  const { targetTool, originalArgs } = context

  // Example: enforce type safety
  if (originalArgs && typeof originalArgs !== 'object') {
    return {
      valid: false,
      error: 'Arguments must be an object'
    }
  }

  console.log(`[code-pattern] Validated ${targetTool}`)

  return {
    valid: true,
    transformedArgs: originalArgs
  }
}

// Health check
app.get('/health', (c) => c.json({ status: 'ok', servers: Object.keys(servers) }))

export default app

