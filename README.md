# Steffi

A TypeScript library for DAG (directed acyclic graph) execution. (named after [Steffi Graf](https://en.wikipedia.org/wiki/Steffi_Graf))

## Installation

```bash
npm install steffi
```

## Usage

### Basic Example

```typescript
import { DependencyGraph, GraphRegistry } from 'steffi'

// Define your event return types
interface MyEvents {
  init: void
  fetchUser: { userData: any }
  loadProfile: { profileData: any }
  loadPosts: { posts: any[] }
}

// Create a graph
const graph = new DependencyGraph<MyEvents>()

// Register events with dependencies
graph.registerEvent(
  'fetchUser',
  ['init'], // depends on init
  async () => {
    const response = await fetch(`/api/user/123`)
    const userData = await response.json()
    return userData
  },
)

graph.registerEvent(
  'loadProfile',
  ['fetchUser'], // depends on fetchUser
  async ({ fetchUser: userData }) => {
    // Use the userData from fetchUser event
    return { profile: userData }
  }
)

graph.registerEvent(
  'loadPosts',
  ['fetchUser'], // also depends on fetchUser
  async ({ fetchUser: userData }) => {
    const posts = await fetch(`/api/users/${userData.id}/posts`)
    return posts.json()
  }
)

// AND dependencies (all must complete)
graph.registerEvent('makeSandwich', ['getBread', 'getFillings'], 
  async ({ getBread, getFillings }) => {
    // Need both bread AND fillings for a sandwich!
  }
)

// OR dependencies (any group must complete)
graph.registerEvent('getToWork', [
  ['bicycle', 'helmet'],              // Group 1: Bike to work
  ['busPass', 'exactChange'],         // Group 2: Take the bus
  ['car', 'parkingPass', 'coffee'],   // Group 3: Drive (coffee mandatory)
  ['teleportDevice']                  // Group 4: Future commute
], async (deps) => {
  // Requires EITHER
  // (bicycle AND helmet) OR
  // (busPass AND exactChange) OR
  // (car AND parkingPass AND coffee) OR
  // (teleportDevice)
})

// Trigger the graph
await graph.completeEvent('init')
```

### Visualization

```typescript
// Start the visualization server
const registry = GraphRegistry.getInstance()
registry.registerGraph('userFlow', graph)
registry.startVisualizationServer(3000)
```

Then open `http://localhost:3000` in your browser to view your graph.

## API Reference

### DependencyGraph

#### `registerEvent(type, dependencies, runnable, options?)`

Register a new event with its dependencies and execution function.

- `type`: The name/key of the event
- `dependencies`: Can be specified in two formats:
  - Array of dependencies (AND logic): `['dep1', 'dep2']` requires all dependencies to be completed
  - Array of dependency groups (OR logic): `[['dep1', 'dep2'], ['dep3', 'dep4']]` requires all dependencies within any group to be completed
- `runnable`: Function that receives values from completed dependencies as arguments
- `options`: Optional configuration object
  - `fireOnComplete`: Set to `false` to handle completion manually with `completeEvent`
  - `maxRetries`: Number of retry attempts for failed events
  - `retryDelay`: Delay between retries in milliseconds
  - `timeout`: Maximum execution time in milliseconds

Examples:

- `registerEvent('myEvent', [], handler, {
  maxRetries: 3,
  fireOnComplete: true,
  retryDelay: 1000, // ms
  timeout: 5000 // ms
})`

- `registerEvent('myEvent', [], handler, {
  maxRetries: 3,
  fireOnComplete: false,
  retryDelay: 1000, // ms
  timeout: 5000 // ms
})`

### GraphRegistry

- `getInstance()`: Get singleton instance
- `registerGraph(name, graph)`: Register a graph for visualization
- `startVisualizationServer(port)`: Start the visualization server

## Configuration

```typescript
// Configure event options
graph.registerEvent('myEvent', [], handler, {
  maxRetries: 3,
  fireOnComplete: true,
  retryDelay: 1000, // ms
  timeout: 5000 // ms
})
```

## TODO: separate visualization server from rest of library

### Deregistering Events

Remove an event from the graph using `deregisterEvent`. By default, this will only succeed if the event has no dependents.