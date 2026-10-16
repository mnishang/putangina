import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

function missingApiGuard() {
  return {
    name: 'sable-stem-missing-api-guard',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (!request.url?.startsWith('/api/')) {
          next()
          return
        }
        response.statusCode = 503
        response.setHeader('Content-Type', 'application/json; charset=utf-8')
        response.setHeader('Cache-Control', 'no-store')
        response.end(JSON.stringify({
          error: 'The order API is not available in this preview. Restart with the project `npm run dev` command and ensure the managed database connection is available.',
        }))
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), missingApiGuard()],
})
