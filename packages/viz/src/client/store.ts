import { create } from 'zustand'
import { GraphState, GraphEvent } from 'steffi'

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
        console.log('GRAPH_REGISTERED', name, initialState)
        return {
          graphs: { ...state.graphs, [name]: initialState },
          selectedGraph: state.selectedGraph || name
        }
      }
      
      case 'EVENT_REGISTERED': {
        const { graphName, eventName, dependencies, predicates } = event.payload
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
              },
              predicates: {
                ...graph.predicates,
                [eventName]: predicates
              }
            }
          }
        }
      }
      
      case 'EVENT_STARTED': {
        const { graphName, eventName, predicates, at } = event.payload
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
                [eventName]: 'IN_PROGRESS'
              },
              initiatedEvents: {
                ...graph.initiatedEvents,
                [eventName]: [...graph.initiatedEvents[eventName], { at, predicates }]
              }
            }
          }
        }
      }

      case 'EVENT_COMPLETED': {
        const { graphName, eventName, value, at } = event.payload
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
                [eventName]: 'COMPLETED'
              },
              completedEvents: {
                ...graph.completedEvents,
                [eventName]: [...graph.completedEvents[eventName], { at, value }]
              },
            }
          }
        }
      }

      case 'EVENT_FAILED': {
        const { graphName, eventName, error, at } = event.payload
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
                [eventName]: 'FAILED'
              },
              failedEvents: {
                ...graph.failedEvents,
                [eventName]: [...graph.failedEvents[eventName], { at, error }]
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