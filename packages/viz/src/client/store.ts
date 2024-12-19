import { create } from 'zustand'
import { GraphState, GraphEvent, EventStatus } from '../types'

interface Store {
  graphs: Record<string, GraphState>
  selectedGraph: string | null
  selectedNode: string | null
  hoveredNode: string | null
  handleEvent: (event: GraphEvent) => void
  selectGraph: (name: string) => void
  selectNode: (name: string | null) => void
  setHoveredNode: (name: string | null) => void
}

export const useStore = create<Store>((set) => ({
  graphs: {},
  selectedGraph: null,
  selectedNode: null,
  hoveredNode: null,
  
  handleEvent: (event) => set(state => {
    switch (event.type) {
      case 'GRAPH_REGISTERED': {
        const { name, initialState } = event.payload
        return {
          graphs: { ...state.graphs, [name]: initialState },
          selectedGraph: state.selectedGraph || name
        }
      }
      
      case 'EVENT_REGISTERED': {
        const { graphName, eventName, dependencies } = event.payload
        const graph = state.graphs[graphName]
        if (!graph) return state

        return {
          ...state,
          graphs: {
            ...state.graphs,
            [graphName]: {
              ...graph,
              dependencies: {
                ...graph.dependencies,
                [eventName]: dependencies
              }
            }
          }
        }
      }
      
      case 'EVENT_STARTED': {
        const { graphName, eventName } = event.payload
        const graph = state.graphs[graphName]
        if (!graph) return state

        return {
          ...state,
          graphs: {
            ...state.graphs,
            [graphName]: {
              ...graph,
              status: {
                ...graph.status,
                [eventName]: EventStatus.IN_PROGRESS
              }
            }
          }
        }
      }

      case 'EVENT_COMPLETED': {
        const { graphName, eventName, value } = event.payload
        const graph = state.graphs[graphName]
        if (!graph) return state

        return {
          ...state,
          graphs: {
            ...state.graphs,
            [graphName]: {
              ...graph,
              status: {
                ...graph.status,
                [eventName]: EventStatus.COMPLETED
              },
              completedEvents: {
                ...graph.completedEvents,
                [eventName]: value
              },
              completedTimestamps: {
                ...graph.completedTimestamps,
                [eventName]: Date.now()
              }
            }
          }
        }
      }

      case 'EVENT_FAILED': {
        const { graphName, eventName, error } = event.payload
        const graph = state.graphs[graphName]
        if (!graph) return state

        return {
          ...state,
          graphs: {
            ...state.graphs,
            [graphName]: {
              ...graph,
              status: {
                ...graph.status,
                [eventName]: EventStatus.FAILED
              },
              errors: {
                ...graph.errors,
                [eventName]: error
              },
              failedTimestamps: {
                ...graph.failedTimestamps,
                [eventName]: Date.now()
              }
            }
          }
        }
      }

      default:
        return state
    }
  }),
  
  selectGraph: (name) => set({ selectedGraph: name }),
  selectNode: (name) => set({ selectedNode: name }),
  setHoveredNode: (name) => set({ hoveredNode: name })
})) 