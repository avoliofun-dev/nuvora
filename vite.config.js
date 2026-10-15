import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import visitHandler from './api/visit.js';

function apiDevPlugin() {
  return {
    name: 'api-dev-server',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url && req.url.startsWith('/api/visit') && req.method === 'POST') {
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', async () => {
            try {
              req.body = JSON.parse(body || '{}');
            } catch {
              req.body = {};
            }
            res.json = data => {
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify(data));
            };
            res.status = code => {
              res.statusCode = code;
              return res;
            };
            try {
              await visitHandler(req, res);
            } catch (e) {
              res.statusCode = 500;
              res.end(JSON.stringify({ ok: false, error: e.message }));
            }
          });
          return;
        }
        next();
      });
    }
  };
}

export default defineConfig({
  plugins: [react(), apiDevPlugin()]
});
