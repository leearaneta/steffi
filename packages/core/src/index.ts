// Core exports
export { DependencyGraph } from './DependencyGraph'
export type { 
  GraphState, 
  GraphEvent,
  EventStatus,
  BaseEventPayloads,
  DependencyGraphOptions,
  EventOptions
} from '@steffi/types'

// optional visualization export
let GraphRegistry: any
try {
  GraphRegistry = require('steffi-viz').GraphRegistry
} catch {
  GraphRegistry = class {
    static getInstance() {
      throw new Error('Visualization functionality requires steffi-viz package. Install it with: npm install steffi-viz')
    }
  }
}
export { GraphRegistry }