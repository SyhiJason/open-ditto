import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import OpenAI from 'openai';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'path';
import { defineConfig, loadEnv, type Plugin } from 'vite';

type ChatPayload = {
  model?: string;
  messages?: Array<{ role?: string; content?: string }>;
};

function writeJson(res: ServerResponse, statusCode: number, data: unknown) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(data));
}

async function readJsonBody(req: IncomingMessage): Promise<ChatPayload> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString('utf-8');
  return raw ? (JSON.parse(raw) as ChatPayload) : {};
}

function moonshotProxyPlugin(apiKey: string | undefined): Plugin {
  const client = apiKey
    ? new OpenAI({
      apiKey,
      baseURL: 'https://api.moonshot.cn/v1',
    })
    : null;

  const handler = async (
    req: IncomingMessage & { originalUrl?: string },
    res: ServerResponse,
    next: () => void
  ) => {
    const pathname = (req.originalUrl ?? req.url ?? '').split('?')[0];
    if (pathname !== '/api/ai/chat') {
      next();
      return;
    }

    if (req.method !== 'POST') {
      writeJson(res, 405, { error: 'Method not allowed' });
      return;
    }

    if (!client) {
      writeJson(res, 500, { error: 'MOONSHOT_API_KEY is not configured on the server.' });
      return;
    }

    try {
      const body = await readJsonBody(req);
      const model = body.model && typeof body.model === 'string' ? body.model : 'moonshot-v1-8k';
      const messages = Array.isArray(body.messages)
        ? body.messages
          .filter((m) => typeof m?.role === 'string' && typeof m?.content === 'string')
          .map((m) => ({ role: m.role as 'system' | 'user' | 'assistant', content: m.content! }))
        : [];

      if (messages.length === 0) {
        writeJson(res, 400, { error: 'messages must contain at least one valid item.' });
        return;
      }

      const completion = await client.chat.completions.create({
        model,
        messages,
      });

      const content = completion.choices[0]?.message?.content;
      const text = typeof content === 'string' ? content : JSON.stringify(content ?? '');

      writeJson(res, 200, { content: text });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown server error';
      writeJson(res, 500, { error: message });
    }
  };

  return {
    name: 'moonshot-chat-proxy',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        void handler(req, res, next);
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        void handler(req, res, next);
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const apiKey = env.MOONSHOT_API_KEY || process.env.MOONSHOT_API_KEY;
  return {
    plugins: [react(), tailwindcss(), moonshotProxyPlugin(apiKey)],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
