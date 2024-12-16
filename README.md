# Steffi

A TypeScript library for building and visualizing type-safe dependency graphs. ( named after [Steffi Graf](https://en.wikipedia.org/wiki/Steffi_Graf))

## Features

- 🎯 Type-safe event registration and execution
- 🔄 Complex dependency management with AND/OR conditions
- 🎨 Built-in visualization server
- 🔍 Real-time event monitoring
- ⚡ Automatic retry and timeout handling
- 🛡️ Cycle detection
- 🔄 Event reset capabilities

## Installation

```bash
npm install steffi
```

## Basic Usage

```typescript
import { DependencyGraph } from 'steffi'

// Define your event types
interface Events {
  fetchUser: { id: string; name: string }
  loadProfile: { profile: any }
  loadPosts: { posts: any[] }
}

// Create a graph
const graph = new DependencyGraph<Events>()

// Register events with dependencies
graph.registerEvent(
  'fetchUser',
  [], // no dependencies
  async () => {
    const response = await fetch('/api/user/123')
    return response.json()
  }
)

graph.registerEvent(
  'loadProfile',
  ['fetchUser'], // depends on fetchUser
  async ({ fetchUser }) => {
    const profile = await fetch(`/api/profiles/${fetchUser.id}`)
    return { profile: await profile.json() }
  }
)

// Activate and start the graph; any events without dependencies will run immediately
graph.activate()
```

## Advanced Features

### OR Dependencies

Events can have OR dependencies, where only one group needs to be satisfied:

```typescript
graph.registerEvent('getToWork', [
  ['bicycle', 'helmet'],         // Option 1: Bike to work
  ['busPass', 'exactChange'],    // Option 2: Take the bus
  ['car', 'parkingPass']         // Option 3: Drive
], async (deps) => {
  // Will run when ANY group is complete
})
```

### Predicates

Predicates allow you to add conditional logic to when events should execute. Events will only run when all their predicates return true:

```typescript
graph.registerEvent('submitOrder', ['cart', 'userInfo'], handler, {
  predicates: [
    {
      required: ['cart'],
      fn: ({ cart }) => cart.items.length > 0,
      name: 'cartNotEmpty'  // optional name for debugging
    },
    {
      required: ['cart', 'userInfo'],
      fn: ({ cart, userInfo }) => cart.total <= userInfo.creditLimit
    }
  ]
})
```

Multiple predicates are evaluated with AND logic - all must be satisfied. Each predicate:
- Can access any subset of dependencies via `required`
- Must return a boolean
- Is evaluated whenever its required dependencies change
- Can have an optional name for debugging

### Event Options

```typescript
graph.registerEvent('criticalTask', ['dependency'], handler, {
  maxRetries: 3,           // Retry failed events
  retryDelay: 1000,        // Wait between retries (ms)
  timeout: 5000,           // Maximum execution time (ms)
  fireOnComplete: false    // Manual completion mode
})
```

### Visualization

```typescript
import { GraphRegistry } from 'steffi'

const registry = GraphRegistry.getInstance()
registry.registerGraph('myGraph', graph)
registry.startVisualizationServer(3000)
```

Then open `http://localhost:3000` to see your graph visualization.

### Manual Event Completion

By default, events automatically complete when their handler finishes. You can override this with `fireOnComplete: false` to manually control when events complete:

```typescript
// Registration
graph.registerEvent('validateOrder', ['cart'], 
  async ({ cart }) => {
    // This won't automatically complete the event
    await validateItems(cart)
  }, 
  { fireOnComplete: false }
)

// Later, manually complete the event
await graph.completeEvent('validateOrder', { isValid: true })
```

## API Reference

### DependencyGraph

- `registerEvent(type, dependencies, handler, options?)`
- `completeEvent(type, value?)`
- `resetEvent(type)` // this will reset the event and all its dependents, and refire the event
- `activate()`
- `getEventStatus(type)`

### GraphRegistry

- `getInstance()`
- `registerGraph(name, graph)`
- `startVisualizationServer(port)`

## Example

For a complete example, see the potion brewing simulation in the example directory.

## License

MIT