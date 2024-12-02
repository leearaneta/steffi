import { DependencyGraph } from './DependencyGraph'
import { createServer, Server } from 'http'
import path from 'path'
import fs from 'fs'
import http from 'http'
import { EventError, GraphEvent } from '../types'

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

  registerGraph(name: string, graph: DependencyGraph<any>) {
    this.graphs.set(name, graph)
    
    this.broadcast({
      type: 'GRAPH_REGISTERED',
      payload: {
        name,
        initialState: graph.getGraph()
      }
    })

    graph.on('eventRegistered', (eventName: string, dependencies: string[]) => {
      this.broadcast({
        type: 'EVENT_REGISTERED',
        payload: { graphName: name, eventName, dependencies }
      })
    })

    graph.on('eventStarted', (eventName: string) => {
      this.broadcast({
        type: 'EVENT_STARTED',
        payload: { graphName: name, eventName }
      })
    })

    graph.on('eventCompleted', (eventName: string, value: any) => {
      this.broadcast({
        type: 'EVENT_COMPLETED',
        payload: { graphName: name, eventName, value }
      })
    })

    graph.on('eventFailed', (eventName: string, error: EventError) => {
      this.broadcast({
        type: 'EVENT_FAILED',
        payload: { graphName: name, eventName, error }
      })
    })
  }

  getGraph(name: string) {
    return this.graphs.get(name)
  }

  startVisualizationServer(port: number): Server {
    if (this.server) {
      console.warn('Visualization server is already running')
      return this.server
    }

    this.server = createServer((req, res) => {
      const distPath = path.join(__dirname, '../client/dist')

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
      let filePath = path.join(distPath, req.url === '/' ? 'index.html' : req.url!)
      
      if (!fs.existsSync(filePath)) {
        filePath = path.join(distPath, 'index.html')
      }

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