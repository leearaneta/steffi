import React, { useEffect, useRef } from 'react'
import { Network } from 'vis-network'
import { useStore } from './store'
import type { EventStatus, GraphState } from 'steffi'
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

    // Destroy existing network if it exists
    if (networkRef.current) {
      networkRef.current.destroy()
      networkRef.current = null
    }

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
        smooth: {
          enabled: true,
          type: 'curvedCW',
          roundness: 0.2 + (0.1 * edge.group)
        }
      }))
    }

    const networkConfig: Record<string, any> = {
      height: '100%',
      width: '100%',
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
    }

    if (!currentGraph.allowCycles) {
      networkConfig.layout = {
        hierarchical: {
          direction: 'LR',
          sortMethod: 'directed',
          nodeSpacing: 250,
          levelSeparation: 250,
        }
      }
    }

    // Create new network with current configuration
    const network = new Network(graphRef.current, visData, networkConfig)

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

  }, [selectedGraph, graphs])

  type NodeEvent = {
    type: 'initiated' | 'completed' | 'failed'
    at: Date
    data: any
  }

  const getNodeEvents = (nodeId: string): NodeEvent[] => {
    if (!currentGraph) return []

    const events: NodeEvent[] = []

    // Add initiated events
    const initiated = currentGraph.initiatedEvents[nodeId] || []
    ;(Array.isArray(initiated) ? initiated : [initiated]).forEach(init => {
      if (init) {
        events.push({
          type: 'initiated',
          at: new Date(init.at),
          data: init.predicates
        })
      }
    })

    // Add completed events
    const completed = currentGraph.completedEvents[nodeId] || []
    completed.forEach(({ at, value }) => {
      events.push({
        type: 'completed',
        at: new Date(at),
        data: value
      })
    })

    // Add failed events
    const failed = currentGraph.failedEvents[nodeId] || []
    failed.forEach(({ at, error }) => {
      events.push({
        type: 'failed',
        at: new Date(at),
        data: error
      })
    })

    // Sort by timestamp
    return events.sort((a, b) => a.at.getTime() - b.at.getTime())
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
              <strong style={{ fontSize: '1.2em' }}>{displayNode}</strong>
              {currentGraph?.predicates[displayNode] && currentGraph.predicates[displayNode].length > 0 && (
                <div className="predicates-section">
                  <strong>Available Predicates:</strong>
                  <ul>
                    {currentGraph?.predicates[displayNode]?.map(predicate => (
                      <li key={predicate.name}>
                        {predicate.name}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="node-events">
                {getNodeEvents(displayNode).map((event, index) => (
                  <div key={`${event.type}-${event.at.getTime()}-${index}`} className={`event-item event-${event.type}`}>
                    <div className="event-header">
                      <div className="event-type">{event.type}</div>
                      <div className="event-time">{event.at.toLocaleString()}</div>
                    </div>
                    { !(Array.isArray(event.data) && event.data.length === 0 || !event.data) && (
                      <div className="event-content">
                        {event.type === 'initiated' && (
                          <div className="predicates-list">
                            <strong>Passed Predicates:</strong>
                            <ul>
                              {event.data.map((predicate: string) => (
                                <li key={predicate}>{predicate}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {event.type === 'completed' && (
                          <pre>{JSON.stringify(event.data, null, 2)}</pre>
                        )}
                        {event.type === 'failed' && (
                          <div className="error-message">{String(event.data)}</div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="graph" ref={graphRef} />
      </div>
    </div>
  )
}