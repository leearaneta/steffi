// Core exports
export { DependencyGraph } from './DependencyGraph'
export * from './types'

// optional visualization export
let GraphRegistry: any
try {
  const viz = require('steffi-viz')
  if (!viz || !viz.GraphRegistry) {
    throw new Error('GraphRegistry not found in steffi-viz')
  }
  GraphRegistry = viz.GraphRegistry
  console.log('Successfully loaded GraphRegistry from steffi-viz')
} catch (error) {
  console.warn('Failed to load steffi-viz:', error)
  GraphRegistry = class {
    static getInstance() {
      throw new Error('Visualization functionality requires steffi-viz package. Install it with: npm install steffi-viz')
    }
  }
}
export { GraphRegistry }