import { Hono, Context } from 'hono';
import { spawn } from 'child_process';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { toFetchResponse, toReqRes } from 'fetch-to-node';
import {
  CallToolResult,
  GetPromptResult,
  ReadResourceResult,
} from '@modelcontextprotocol/sdk/types.js';

// Hono context variables type
type Variables = {
  validatedArgs?: any;
  validationTimestamp?: string;
};

// Timestamp utility functions
const getTimestamp = (): string => new Date().toISOString();

const createCompletionMessage = (message: string): string => {
  return `${message} desu: ${getTimestamp()}`;
};

const logWithTimestamp = (message: string): void => {
  console.log(`[${getTimestamp()}] ${message}`);
};

// Server registry with transport types
interface ServerConfig {
  type: 'stdio' | 'http' | 'sse';
  command?: string;
  args?: string[];
  url?: string;
  apiKey?: string;
  tools?: string[];
}

const app = new Hono<{ Variables: Variables }>();

const servers: Record<string, ServerConfig> = {
  'serena': {
    type: 'stdio',
    command: 'uvx',
    args: [
      '--from',
      'git+https://github.com/oraios/serena',
      'serena',
      'start-mcp-server',
      '--context',
      'ide-assistant',
      '--project',
      '/Users/rockgu/playground/serena'
    ],
    tools: ['mcp__serena__*'] // Wildcard matching for all serena tools
  },
  'figma-remote': {
    type: 'http',
    url: 'https://mcp.figma.com/mcp',
    tools: ['figma_*']
  },
  'cloudflare-docs': {
    type: 'http',
    url: 'https://docs.mcp.cloudflare.com/mcp',
    tools: ['mcp__cloudflare-docs__*']
  },
  'context7': {
    type: 'http',
    url: 'https://mcp.context7.com/mcp',
    tools: ['mcp__context7__*']
  },
  'my-mcp': {
    type: 'http',
    url: 'http://localhost:3000/mcp',
    tools: ['ping', 'start-notification-stream']
  }
};

// Helper: Find server for tool
function findServerForTool(toolName: string | undefined): ServerConfig | null {
  if (!toolName) return null;

  for (const [name, server] of Object.entries(servers)) {
    if (server.tools) {
      const matches = server.tools.some((t: string) => {
        if (t.endsWith('*')) {
          return toolName.startsWith(t.slice(0, -1));
        }
        return t === toolName;
      });

      if (matches) {
        logWithTimestamp(`Matched tool '${toolName}' to server '${name}'`);
        return server;
      }
    }
  }

  return null;
}

// Helper: Get auth headers if needed
function getAuthHeaders(server: ServerConfig): Record<string, string> {
  const headers: Record<string, string> = {};
  if (server.apiKey) {
    headers['Authorization'] = `Bearer ${server.apiKey}`;
  }
  return headers;
}

// Code-pattern validation context interface
interface ValidationContext {
  targetTool: string;
  targetServer: ServerConfig | null;
  originalArgs: any;
  timestamp: string;
}

interface ValidationResult {
  valid: boolean;
  error?: string;
  transformedArgs?: any;
  timestamp: string;
}

// Code-pattern validation logic
async function validateCodePattern(context: ValidationContext): Promise<ValidationResult> {
  const startTime = getTimestamp();
  logWithTimestamp(`[code-pattern] Validating ${context.targetTool}`);

  const { targetTool, targetServer, originalArgs } = context;

  // Rule 1: Arguments must be an object if provided
  if (originalArgs && typeof originalArgs !== 'object') {
    return {
      valid: false,
      error: 'Arguments must be an object',
      timestamp: getTimestamp()
    };
  }

  // Rule 2: Ensure serena tools use proper relative paths
  if (targetTool.startsWith('mcp__serena__')) {
    if (originalArgs?.relative_path && originalArgs.relative_path.startsWith('/')) {
      return {
        valid: false,
        error: 'Serena tools require relative paths, not absolute paths',
        timestamp: getTimestamp()
      };
    }
  }

  // Rule 3: Ensure Context7 tools have required parameters
  if (targetTool.startsWith('mcp__context7__')) {
    if (targetTool.includes('get-library-docs') && !originalArgs?.context7CompatibleLibraryID) {
      return {
        valid: false,
        error: 'Context7 get-library-docs requires context7CompatibleLibraryID parameter',
        timestamp: getTimestamp()
      };
    }
  }

  // Rule 4: Add timestamp metadata to all tool calls
  const transformedArgs = {
    ...originalArgs,
    _metadata: {
      ...originalArgs?._metadata,
      validation_timestamp: startTime,
      pattern_enforced: true
    }
  };

  logWithTimestamp(`[code-pattern] ✓ Validated ${targetTool}`);

  return {
    valid: true,
    transformedArgs,
    timestamp: getTimestamp()
  };
}

// Code-pattern enforcement middleware (runs first)
app.use('/gateway/*', async (c, next) => {
  const requestStart = getTimestamp();
  logWithTimestamp('[Gateway] Request received');

  try {
    const body = await c.req.json();

    // Skip enforcement for certain methods
    if (body.method === 'initialize' || body.method === 'tools/list') {
      await next();
      return;
    }

    // Enforce code-pattern for tool calls
    if (body.method === 'tools/call') {
      const toolName = body.params?.name;

      logWithTimestamp(`[Gateway] Enforcing code-pattern for tool: ${toolName}`);

      const validationResult = await validateCodePattern({
        targetTool: toolName,
        targetServer: findServerForTool(toolName),
        originalArgs: body.params?.arguments || {},
        timestamp: requestStart
      });

      if (!validationResult.valid) {
        logWithTimestamp(`[Gateway] Validation failed: ${validationResult.error}`);
        return c.json({
          jsonrpc: '2.0',
          id: body.id,
          error: {
            code: -32602,
            message: createCompletionMessage(
              `Code pattern validation failed: ${validationResult.error}`
            )
          }
        }, 400);
      }

      // Store validated args for downstream routing
      c.set('validatedArgs', validationResult.transformedArgs);
      c.set('validationTimestamp', validationResult.timestamp);
    }

    await next();
  } catch (error: any) {
    logWithTimestamp(`[Gateway] Middleware error: ${error.message}`);
    return c.json({
      jsonrpc: '2.0',
      error: {
        code: -32700,
        message: createCompletionMessage('Parse error: Invalid JSON')
      },
      id: null
    }, 400);
  }
});

// Stdio handler: spawn process and manage communication
async function handleStdioRequest(c: any, server: ServerConfig, body: any): Promise<Response> {
  const requestStart = getTimestamp();
  logWithTimestamp(`[stdio] Spawning ${server.command} ${server.args?.join(' ')}`);

  return new Promise((resolve) => {
    if (!server.command || !server.args) {
      resolve(c.json({
        error: createCompletionMessage('Invalid stdio server configuration')
      }, 500));
      return;
    }

    const proc = spawn(server.command, server.args, {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let responseData = '';

    proc.stdout.on('data', (data) => {
      responseData += data.toString();
    });

    proc.on('close', (code) => {
      try {
        const result = JSON.parse(responseData);
        logWithTimestamp(`[stdio] Process completed with code ${code}`);
        resolve(c.json(result));
      } catch (e) {
        logWithTimestamp(`[stdio] Invalid JSON from stdio server`);
        resolve(c.json({
          error: createCompletionMessage('Invalid JSON from stdio server')
        }, 500));
      }
    });

    proc.stderr.on('data', (data) => {
      logWithTimestamp(`[stdio:${server.command}] ${data}`);
    });

    // Send request to stdin
    proc.stdin.write(JSON.stringify(body) + '\n');
    proc.stdin.end();

    // Timeout after 30 seconds
    setTimeout(() => {
      proc.kill();
      logWithTimestamp(`[stdio] Request timeout after 30s`);
      resolve(c.json({
        error: createCompletionMessage('Request timeout')
      }, 504));
    }, 30000);
  });
}

// HTTP handler: simple proxy
async function handleHttpRequest(c: any, server: ServerConfig, body: any): Promise<Response> {
  const requestStart = getTimestamp();

  if (!server.url) {
    return c.json({
      error: createCompletionMessage('Invalid HTTP server configuration')
    }, 500);
  }

  logWithTimestamp(`[http] Proxying to ${server.url}`);

  try {
    const response = await fetch(server.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(server)
      },
      body: JSON.stringify(body)
    });

    const result = await response.json();
    logWithTimestamp(`[http] Request completed with status ${response.status}`);
    return c.json(result, response.status);
  } catch (error: any) {
    logWithTimestamp(`[http] Request failed: ${error.message}`);
    return c.json({
      error: createCompletionMessage(`HTTP request failed: ${error.message}`)
    }, 500);
  }
}

// SSE handler: proxy with streaming support
async function handleSseRequest(c: any, server: ServerConfig, body: any): Promise<Response> {
  const requestStart = getTimestamp();

  if (!server.url) {
    return c.json({
      error: createCompletionMessage('Invalid SSE server configuration')
    }, 500);
  }

  logWithTimestamp(`[sse] Handling SSE request to ${server.url}`);

  // For SSE, if request needs streaming response
  if (body.method === 'notifications/subscribe' || body.method?.includes('stream')) {
    try {
      const response = await fetch(server.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream',
          ...getAuthHeaders(server)
        },
        body: JSON.stringify(body)
      });

      logWithTimestamp(`[sse] Streaming response initiated`);

      // Stream SSE response back to client
      return new Response(response.body, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive'
        }
      });
    } catch (error: any) {
      logWithTimestamp(`[sse] Streaming failed: ${error.message}`);
      return c.json({
        error: createCompletionMessage(`SSE request failed: ${error.message}`)
      }, 500);
    }
  }

  // Regular JSON response
  return handleHttpRequest(c, server, body);
}

// Unified MCP endpoint with routing
app.all('/gateway/:server?', async (c) => {
  const requestStart = getTimestamp();
  const serverName = c.req.param('server') || 'auto';
  const body = await c.req.json();

  logWithTimestamp(`[Gateway] Routing request for method: ${body.method}`);

  // Auto-detect target server based on tool name
  let targetServer: ServerConfig | null = null;

  if (serverName === 'auto') {
    targetServer = findServerForTool(body.params?.name);
  } else {
    targetServer = servers[serverName] || null;
  }

  if (!targetServer) {
    logWithTimestamp(`[Gateway] Server not found: ${serverName}`);
    return c.json({
      jsonrpc: '2.0',
      id: body.id,
      error: {
        code: -32601,
        message: createCompletionMessage('Server not found')
      }
    }, 404);
  }

  // Route based on transport type
  let response: Response;
  switch (targetServer.type) {
    case 'stdio':
      response = await handleStdioRequest(c, targetServer, body);
      break;
    case 'http':
      response = await handleHttpRequest(c, targetServer, body);
      break;
    case 'sse':
      response = await handleSseRequest(c, targetServer, body);
      break;
    default:
      return c.json({
        error: createCompletionMessage('Unknown transport type')
      }, 500);
  }

  logWithTimestamp(`[Gateway] Request completed`);
  return response;
});

// Local MCP server endpoint (original functionality)
app.post('/mcp', async (c) => {
  const requestStart = getTimestamp();
  logWithTimestamp('[MCP] Local server request received');

  const { req, res } = toReqRes(c.req.raw);

  // Create local MCP server
  const server = new McpServer(
    {
      name: 'stateless-streamable-http-server',
      version: '1.0.0',
    },
    { capabilities: { logging: {} } }
  );

  // Register ping tool with timestamp
  server.tool(
    'ping',
    'A simple ping tool that responds with pong',
    {},
    async (): Promise<CallToolResult> => {
      logWithTimestamp('[MCP] Ping tool called');

      return {
        content: [
          {
            type: 'text',
            text: createCompletionMessage('pong'),
          },
        ],
      };
    }
  );

  // Register notification stream tool
  server.tool(
    'start-notification-stream',
    'Starts sending periodic notifications for testing resumability',
    {
      interval: z
        .number()
        .describe('Interval in milliseconds between notifications')
        .default(100),
      count: z
        .number()
        .describe('Number of notifications to send (0 for 100)')
        .default(10),
    },
    async (
      { interval, count },
      { sendNotification }
    ): Promise<CallToolResult> => {
      const toolStart = getTimestamp();
      logWithTimestamp(`[MCP] Starting notification stream: interval=${interval}, count=${count}`);

      const sleep = (ms: number) =>
        new Promise((resolve) => setTimeout(resolve, ms));
      let counter = 0;

      while (count === 0 || counter < count) {
        counter++;
        try {
          await sendNotification({
            method: 'notifications/message',
            params: {
              level: 'info',
              data: `Periodic notification #${counter} at ${getTimestamp()}`,
            },
          });
        } catch (error) {
          logWithTimestamp(`[MCP] Error sending notification: ${error}`);
        }
        await sleep(interval);
      }

      return {
        content: [
          {
            type: 'text',
            text: createCompletionMessage(
              `Started sending periodic notifications every ${interval}ms`
            ),
          },
        ],
      };
    }
  );

  // Register greeting prompt with timestamp
  server.prompt(
    'greeting-template',
    'A simple greeting prompt template',
    {
      name: z.string().describe('Name to include in greeting'),
    },
    async ({ name }): Promise<GetPromptResult> => {
      logWithTimestamp(`[MCP] Greeting prompt called for: ${name}`);

      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `Please greet ${name} in a friendly manner. ${createCompletionMessage('Prompt ready')}`,
            },
          },
        ],
      };
    }
  );

  // Register greeting resource
  server.resource(
    'greeting-resource',
    'https://example.com/greetings/default',
    { mimeType: 'text/plain' },
    async (): Promise<ReadResourceResult> => {
      logWithTimestamp('[MCP] Greeting resource accessed');

      return {
        contents: [
          {
            uri: 'https://example.com/greetings/default',
            text: createCompletionMessage('Hello, world!'),
          },
        ],
      };
    }
  );

  server.server.onerror = (error) => {
    logWithTimestamp(`[MCP] Server error: ${error}`);
  };

  try {
    const transport: StreamableHTTPServerTransport =
      new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      });

    transport.onerror = (error) => {
      logWithTimestamp(`[MCP] Transport error: ${error}`);
    };

    await server.connect(transport);
    await transport.handleRequest(req, res, await c.req.json());

    res.on('close', () => {
      logWithTimestamp('[MCP] Request closed');
      transport.close();
      server.close();
    });

    return toFetchResponse(res);
  } catch (e: any) {
    logWithTimestamp(`[MCP] Error: ${e.message}`);
    return c.json(
      {
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: createCompletionMessage('Internal server error'),
        },
        id: null,
      },
      { status: 500 }
    );
  }
});

// Health check endpoint
app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    timestamp: getTimestamp(),
    servers: Object.keys(servers),
    message: createCompletionMessage('Health check complete')
  });
});

// Gateway status endpoint
app.get('/gateway/status', (c) => {
  return c.json({
    status: 'ok',
    timestamp: getTimestamp(),
    servers: Object.entries(servers).map(([name, config]) => ({
      name,
      type: config.type,
      tools: config.tools?.length || 0
    })),
    message: createCompletionMessage('Gateway status retrieved')
  });
});

// Fallback for unsupported methods on /mcp
app.get('/mcp', async (c) => {
  logWithTimestamp('[MCP] Received GET request (not allowed)');
  return c.json(
    {
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: createCompletionMessage('Method not allowed'),
      },
      id: null,
    },
    { status: 405 }
  );
});

app.delete('/mcp', async (c) => {
  logWithTimestamp('[MCP] Received DELETE request (not allowed)');
  return c.json(
    {
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: createCompletionMessage('Method not allowed'),
      },
      id: null,
    },
    { status: 405 }
  );
});

export default app;
