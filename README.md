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

- `registerEvent(type, dependencies, runnable, options?)`: Register a new event. The runnable function receives values from completed dependencies as arguments. For example, if event depends on `fetchUser` which completed with `{ userId: '123' }`, the runnable receives `{ fetchUser: { userId: '123' } }`. Set `options.fireOnComplete: false` to handle completion manually with `completeEvent`.
- `completeEvent(type, value?)`: Complete an event with optional value (that will be passed into all dependents' runnables).
- `resetEvent(type)`: Reset an event and its dependents
- `resetEventsAfterTime(time)`: Reset events completed before given time
- `unsafelyDeregisterEvent(type)`: Remove an event and its dependents
- `trySafelyDeregisterEvent(type)`: Remove an event if it has no dependents

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