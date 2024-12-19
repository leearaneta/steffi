import React, { useEffect, useRef } from 'react'
import { Network } from 'vis-network'
import { useStore } from './store'
import type { EventStatus, GraphState } from '@steffi/types'
import './App.css'

const EDGE_COLORS = [
  '#2196f3',  // blue
  '#4caf50',  // green
  '#ff9800',  // orange
  '#9c27b0',  // purple
  '#795548',  // brown
]

function getNodeColor(status: EventStatus | undefined): string {
  switch (status) {
    case 'PENDING': return '#ffeb3b'
    case 'IN_PROGRESS': return '#2196f3'
    case 'COMPLETED': return '#4caf50'
    case 'FAILED': return '#f44336'
    default: return '#9e9e9e'
  }
}

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
  const currentGraph: GraphState | undefined = selectedGraph ? graphs[selectedGraph] : undefined

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
    const edges: Array<{ from: string; to: string; group: number }> = []

    Object.entries(currentGraph.dependencies).forEach(([targetNode, depGroups]) => {
      nodes.add(targetNode)
      
      depGroups.forEach((group, groupIndex) => {
        group.forEach(dep => {
          nodes.add(dep)
          edges.push({
            from: dep,
            to: targetNode,
            group: groupIndex % EDGE_COLORS.length
          })
        })
      })
    })

    const visData = {
      nodes: Array.from(nodes).map(id => ({
        id,
        label: id,
        color: getNodeColor(currentGraph.status[id])
      })),
      edges: edges.map((edge, index) => ({
        from: edge.from,
        to: edge.to,
        color: EDGE_COLORS[edge.group],
        width: 2,
        // offset parallel edges with different curvature values
        smooth: {
          enabled: true,
          type: 'curvedCW',
          roundness: 0.2 + (0.1 * edge.group)
        }
      }))
    }

    if (!networkRef.current) {
      const network = new Network(graphRef.current, visData, {
        height: '100%',
        width: '100%',
        layout: {
          hierarchical: {
            enabled: true,
            direction: 'LR',
            sortMethod: 'directed',
            levelSeparation: 200,
            nodeSpacing: 100
          }
        },
        physics: false,
        interaction: { hover: true },
        nodes: {
          shape: 'box',
          margin: { top: 10, bottom: 10, left: 10, right: 10 },
          font: { size: 14 }
        },
        edges: {
          arrows: 'to',
          smooth: {
            enabled: true,
            type: 'curvedCW',
            roundness: 0.2
          }
        }
      })

      network.on('hoverNode', params => {
        setHoveredNode(params.node)
      })

      network.on('blurNode', () => {
        setHoveredNode(null)
      })

      network.on('selectNode', params => {
        selectNode(params.nodes[0])
      })

      networkRef.current = network
    } else {
      networkRef.current.setData(visData)
    }
  }, [selectedGraph, graphs])

  const getNodeValue = (nodeId: string) => {
    return currentGraph?.completedEvents[nodeId]
  }

  const getNodeTimestamp = (nodeId: string) => {
    if (!currentGraph?.completedTimestamps[nodeId]) return null
    return new Date(currentGraph.completedTimestamps[nodeId])
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

          {displayNode && (
            <div className="node-value">
              <strong style={{ fontSize: '1.2em' }}> {displayNode} </strong>
              <br></br>
              {currentGraph?.status[displayNode] === 'COMPLETED' &&
                <>
                  <div className="node-timestamp">
                    Completed: {getNodeTimestamp(displayNode)?.toLocaleString()}
                  </div>
                  <br></br>
                  <pre>
                    {JSON.stringify(getNodeValue(displayNode), null, 2)}
                  </pre>
                  <br></br>
                </>
              }
              {currentGraph?.predicates[displayNode] && currentGraph.predicates[displayNode].length > 0 && (
                <>
                  <strong> Predicates </strong>
                  <ul>
                    {currentGraph?.predicates[displayNode]?.map(predicate => (
                      <li
                        style={{ color: predicate.passed ? 'black' : 'grey' }}
                        key={predicate.name}
                      >
                        {predicate.name}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
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
                <li key={`${eventId}-${currentGraph?.failedTimestamps[eventId]}`} className="error-item">
                  <span className="error-event">Event: {eventId}</span>
                  <span className="error-message">{error}</span>
                  <span className="error-time">
                    {new Date(currentGraph.failedTimestamps[eventId]).toLocaleString()}
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