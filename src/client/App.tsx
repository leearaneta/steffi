import React, { useEffect, useRef } from 'react'
import { Network } from 'vis-network'
import { useStore } from './store'
import { EventStatus } from '../types'
import './App.css'

export const App: React.FC = () => {
  const graphRef = useRef<HTMLDivElement>(null)
  const networkRef = useRef<Network | null>(null)
  const { 
    graphs, 
    selectedGraph, 
    selectedNode,
    hoveredNode,
    selectGraph, 
    selectNode,
    setHoveredNode 
  } = useStore()
  const currentGraph = selectedGraph ? graphs[selectedGraph] : undefined

  useEffect(() => {
    const eventSource = new EventSource('http://localhost:3000/events')
    
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

    Object.entries(currentGraph.dependencies).forEach(([node, deps]) => {
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
        color: getNodeColor(currentGraph.status[id])
      })),
      edges
    }

    if (!networkRef.current) {
      const network = new Network(graphRef.current, visData, {
        height: '100%',
        width: '100%',
        physics: { stabilization: true },
        interaction: { hover: true },
        nodes: {
          shape: 'box',
          margin: { top: 10, bottom: 10 },
          font: { size: 14 }
        },
        edges: { arrows: 'to' }
      })
      
      network.on('selectNode', (params) => {
        selectNode(params.nodes[0])
      })
      
      network.on('hoverNode', (params) => {
        setHoveredNode(params.node)
      })
      
      network.on('blurNode', () => {
        setHoveredNode(null)
      })

      network.on('deselectNode', () => {
        selectNode(null)
      })
      
      networkRef.current = network
    } 
    networkRef.current.setData(visData)
  }, [selectedGraph, graphs])

  const getNodeValue = (nodeId: string) => {
    if (!currentGraph?.completedEvents[nodeId]) return null
    return currentGraph.completedEvents[nodeId].value
  }

  const displayNode = hoveredNode || selectedNode

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

          {displayNode && currentGraph?.status[displayNode] === EventStatus.COMPLETED && (
            <>
                <div className="node-value">
                <strong>{displayNode}</strong>
                <pre>
                  {JSON.stringify(getNodeValue(displayNode), null, 2)}
                </pre>
              </div>
            </>
          )}
        </div>
        <div className="graph" ref={graphRef} />
      </div>
      <div className="errors-container">
        {currentGraph && Object.keys(currentGraph.errors).length > 0 && (
          <>
            <h3>Errors</h3>
            <ul className="error-list">
              {Object.entries(currentGraph.errors).map(([eventId, error]) => (
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