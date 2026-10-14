import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { resolve, extname, sep } from 'node:path'
import { gzipSync } from 'node:zlib'

const contentTypes = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.webp': 'image/webp', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.woff2': 'font/woff2'
}

// A compressed production build, without starting the API or connecting to a database.
export async function serveLoginBuild(directory) {
  const root = resolve(directory)
  await stat(resolve(root, 'index.html'))
  const server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname)
      if (pathname.startsWith('/edusystem/api/')) {
        response.writeHead(404).end('Performance checks must not call the API')
        return
      }
      let file = resolve(root, `.${pathname}`)
      if (!file.startsWith(root + sep) && file !== root) {
        response.writeHead(403).end()
        return
      }
      if (!extname(pathname)) file = resolve(root, 'index.html')
      let body = await readFile(file)
      const extension = extname(file)
      const headers = { 'Content-Type': contentTypes[extension] || 'application/octet-stream' }
      headers['Cache-Control'] = extension === '.html' ? 'no-store' : 'public, max-age=31536000, immutable'
      if (/\.(html|js|css|svg)$/.test(file) && /\bgzip\b/.test(request.headers['accept-encoding'] || '')) {
        body = gzipSync(body)
        headers['Content-Encoding'] = 'gzip'
        headers.Vary = 'Accept-Encoding'
      }
      headers['Content-Length'] = body.length
      response.writeHead(200, headers).end(body)
    } catch {
      response.writeHead(404).end()
    }
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  return {
    url: `http://127.0.0.1:${server.address().port}/`,
    close: () => new Promise(resolve => {
      server.close(resolve)
      server.closeAllConnections()
    })
  }
}
