import { DependencyGraph } from 'steffi'
import { createServer, Server } from 'http'
import path from 'path'
import fs from 'fs'
import http from 'http'
import type { BaseEventPayloads, EventError, GraphEvent, DependencyPredicate } from 'steffi'

export class GraphRegistry {
  private static instance: GraphRegistry
  private graphs: Map<string, DependencyGraph<any>> = new Map()
  private server: ReturnType<typeof createServer> | null = null
  private clients: Set<http.ServerResponse> = new Set()

  private constructor() {}

  static getInstance(): GraphRegistry {
    if (!GraphRegistry.instance) {
      GraphRegistry.instance = new GraphRegistry()
    }
    return GraphRegistry.instance
  }

  registerGraph<T extends BaseEventPayloads>(name: string, graph: DependencyGraph<T>) {
    this.graphs.set(name, graph)
    
    this.broadcast({
      type: 'GRAPH_REGISTERED',
      payload: {
        name,
        initialState: graph.getGraph()
      }
    })

    graph.on('eventRegistered', (eventName: string, dependencies: string[][], predicates: DependencyPredicate<any>[]) => {
      this.broadcast({
        type: 'EVENT_REGISTERED',
        payload: { graphName: name, eventName, dependencies, predicates }
      })
    })

    graph.on('eventStarted', (eventName: string, predicates: string[], at: Date) => {
      this.broadcast({
        type: 'EVENT_STARTED',
        payload: { graphName: name, eventName, predicates, at }
      })
    })

    graph.on('eventCompleted', (eventName: string, value: any, at: Date) => {
      this.broadcast({
        type: 'EVENT_COMPLETED',
        payload: { graphName: name, eventName, value, at }
      })
    })

    graph.on('eventFailed', (eventName: string, error: EventError, at: Date) => {
      this.broadcast({
        type: 'EVENT_FAILED',
        payload: { graphName: name, eventName, error, at }
      })
    })
  }

  getGraph(name: string) {
    return this.graphs.get(name)
  }

  startVisualizationServer(port: number, options: { dev?: boolean } = {}): Server {
    if (this.server) {
      console.warn('Visualization server is already running')
      return this.server
    }

    this.server = createServer((req, res) => {
      if (options.dev) {
        res.setHeader('Access-Control-Allow-Origin', '*')
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
      }

      if (req.method === 'OPTIONS') {
        res.writeHead(204)
        res.end()
        return
      }

      if (req.url === '/events') {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          ...(options.dev && { 'Access-Control-Allow-Origin': '*' })
        })

        this.clients.add(res)

        this.graphs.forEach((graph, name) => {
          const data = {
            type: 'GRAPH_REGISTERED',
            payload: {
              name,
              initialState: graph.getGraph()
            }
          }
          console.log(graph.getGraph())
          res.write(`data: ${JSON.stringify(data)}\n\n`)
        })

        req.on('close', () => {
          this.clients.delete(res)
        })
        return
      }

      // static file serving
      let filePath = path.join(__dirname, 'client')
      
      // If we're in development mode, use the dist/client directory
      if (!fs.existsSync(filePath)) {
        filePath = path.join(__dirname, '../client')
      }
      
      console.log('Base path:', filePath)
      console.log('Request URL:', req.url)
      
      if (req.url === '/') {
        filePath = path.join(filePath, 'index.html')
      } else {
        filePath = path.join(filePath, req.url!)
      }

      if (!fs.existsSync(filePath)) {
        console.log('File not found, trying index.html:', filePath)
        filePath = path.join(path.dirname(filePath), 'index.html')
      }
      console.log('Final path:', filePath)
      console.log('File exists?', fs.existsSync(filePath))

      const extname = path.extname(filePath)
      const contentType = {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml'
      }[extname] || 'application/octet-stream'

      fs.readFile(filePath, (error, content) => {
        if (error) {
          if (error.code === 'ENOENT') {
            res.writeHead(404)
            res.end('File not found')
          } else {
            res.writeHead(500)
            res.end(`Server Error: ${error.code}`)
          }
        } else {
          res.writeHead(200, { 'Content-Type': contentType })
          res.end(content, 'utf-8')
        }
      })
    })

    this.server.listen(port, () => {
      console.log(`Graph visualization server running at http://localhost:${port}`)
    })

    return this.server
  }

  private broadcast(event: GraphEvent) {
    const data = `data: ${JSON.stringify(event)}\n\n`
    this.clients.forEach(client => {
      try {
        client.write(data)
      } catch (error) {
        console.warn('Failed to send to client, removing from clients list', error)
        this.clients.delete(client)
      }
    })
  }
}