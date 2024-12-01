import create from 'zustand'
import { GraphState, GraphEvent, EventStatus } from '../types'

interface Store {
  graphs: Record<string, GraphState>
  selectedGraph: string | null
  handleEvent: (event: GraphEvent) => void
  selectGraph: (name: string) => void
}

export const useStore = create<Store>((set) => ({
  graphs: {},
  selectedGraph: null,
  
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
              dependencies: new Map([
                ...graph.dependencies,
                [eventName, new Set(dependencies)]
              ])
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
              status: new Map([
                ...graph.status,
                [eventName, EventStatus.IN_PROGRESS]
              ])
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
              status: new Map([
                ...graph.status,
                [eventName, EventStatus.COMPLETED]
              ]),
              completedEvents: new Map([
                ...graph.completedEvents,
                [eventName, { at: new Date(), value }]
              ])
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
              status: new Map([
                ...graph.status,
                [eventName, EventStatus.FAILED]
              ]),
              errors: new Map([
                ...graph.errors,
                [eventName, error]
              ])
            }
          }
        }
      }

      default:
        return state
    }
  }),
  
  selectGraph: (name) => set({ selectedGraph: name })
})) 