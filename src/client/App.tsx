import React, { useEffect, useRef } from 'react'
import { Network } from 'vis-network'
import { useStore } from './store'
import { EventStatus } from '../types'
import './App.css'

export const App: React.FC = () => {
  const graphRef = useRef<HTMLDivElement>(null)
  const networkRef = useRef<Network | null>(null)
  const { graphs, selectedGraph, selectGraph } = useStore()
  const currentGraph = selectedGraph ? graphs[selectedGraph] : undefined

  useEffect(() => {
    const eventSource = new EventSource('/events')
    
    eventSource.onmessage = (event) => {
      const graphEvent = JSON.parse(event.data)
      useStore.getState().handleEvent(graphEvent)
    }

    return () => eventSource.close()
  }, [])

  useEffect(() => {
    if (!graphRef.current || !currentGraph) return

    const nodes = new Set<string>()
    const edges: Array<{ from: string; to: string }> = []

    currentGraph.dependencies.forEach((deps, node) => {
      nodes.add(node)
      deps.forEach(dep => {
        nodes.add(dep)
        edges.push({ from: dep, to: node })
      })
    })

    const visData = {
      nodes: Array.from(nodes).map(id => ({
        id,
        label: id,
        color: getNodeColor(currentGraph.status.get(id))
      })),
      edges
    }

    if (!networkRef.current) {
      networkRef.current = new Network(graphRef.current, visData, {
        physics: {
          stabilization: true,
          barnesHut: {
            gravitationalConstant: -80000,
            springConstant: 0.001,
            springLength: 200
          }
        },
        layout: {
          hierarchical: {
            direction: 'LR',
            sortMethod: 'directed'
          }
        }
      })
    } else {
      networkRef.current.setData(visData)
    }
  }, [selectedGraph, graphs])

  return (
    <div className="App">
      <div className="graph-container">
        <div className="sidebar">
          <h3>Available Graphs</h3>
          {Object.keys(graphs).map(name => (
            <div 
              key={name}
              onClick={() => selectGraph(name)}
              className={`graph-item ${selectedGraph === name ? 'selected' : ''}`}
            >
              {name}
            </div>
          ))}
        </div>
        <div className="graph" ref={graphRef} />
      </div>
      <div className="errors-container">
        {currentGraph && Array.from(currentGraph.errors.entries()).length > 0 && (
          <>
            <h3>Errors</h3>
            <ul className="error-list">
              {Array.from(currentGraph.errors.entries()).map(([eventId, error]) => (
                <li key={`${eventId}-${error.timestamp}`} className="error-item">
                  <span className="error-event">Event: {eventId}</span>
                  <span className="error-message">{error.error}</span>
                  <span className="error-time">
                    {new Date(error.timestamp).toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  )
}

function getNodeColor(status: EventStatus | undefined): string {
  switch (status) {
    case EventStatus.PENDING: return '#ffeb3b'
    case EventStatus.IN_PROGRESS: return '#2196f3'
    case EventStatus.COMPLETED: return '#4caf50'
    case EventStatus.FAILED: return '#f44336'
    default: return '#9e9e9e'
  }
}