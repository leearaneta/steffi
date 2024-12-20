# Steffi

A TypeScript library for building and visualizing type-safe, event-driven, directed graphs. (named after [Steffi Graf](https://en.wikipedia.org/wiki/Steffi_Graf))


## Installation

```bash
npm install steffi
```

## Basic Usage

```typescript
import { DependencyGraph } from 'steffi'

interface Events {
  fetchUser: { id: string; name: string }
  loadProfile: { profile: any }
  loadPosts: { posts: any[] }
}

const graph = new DependencyGraph<Events>()

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

// activate and start the graph; any events without dependencies will run immediately
graph.activate()
```

## Advanced Features

### OR Dependencies

Events can have OR dependencies, where only one group needs to be satisfied:

```typescript
graph.registerEvent('getToWork', { or: [
  ['bikeInGoodCondition', 'weatherIsGood'],
  ['busPass', { or: [['exactChange'], ['busTakesCreditCard']] }],
  ['car', 'parkingPass']
] }, async (completedDependencyGroup) => {
  // will run when ANY group is complete.
  // completedDependencyGroup is an array of the dependencies that were completed.
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
      name: 'cartNotEmpty'  // required name for debugging
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
  maxRetries: 3,
  retryDelay: 1000, // ms
  timeout: 5000, // ms
  fireOnComplete: false
})
```

### Visualization

Visualization requires the `steffi-viz` package.

```bash
npm install steffi-viz
```

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
// registration
graph.registerEvent('validateOrder', ['cart'], 
  async ({ cart }) => {
    // this won't automatically complete the event
    await validateItems(cart)
  }, 
  { fireOnComplete: false }
)

// later, manually complete the event
await graph.completeEvent('validateOrder', { isValid: true })
```

### Fault Tolerance & State Recovery

While Steffi doesn't directly handle fault tolerance, you can persist state changes to an external database using the emitted events.

```typescript
// Save all status changes to database
graph.on('eventStarted', (eventName) => {
  await db.saveEventState(eventName, {
    status: 'IN_PROGRESS',
    timestamp: new Date()
  })
})

graph.on('eventCompleted', (eventName, value, timestamp) => {
  await db.saveEventState(eventName, {
    status: 'COMPLETED',
    value,
    timestamp
  })
})

graph.on('eventFailed', (eventName, error, timestamp) => {
  await db.saveEventState(eventName, {
    status: 'FAILED',
    error,
    timestamp
  })
})

// when restarting, query database for last known state
const dbState = await db.getGraphState()
const savedState = {
  completed: {},
  failed: {}
}

// only restore COMPLETED and FAILED events
for (const [eventName, state] of Object.entries(dbState)) {
  if (state.status === 'COMPLETED') {
    savedState.completed[eventName] = {
      value: state.value,
      at: state.timestamp
    }
  } else if (state.status === 'FAILED') {
    savedState.failed[eventName] = {
      error: state.error,
      at: state.timestamp
    }
  }
}

// handle cleanup of any events that were IN_PROGRESS
const inProgressEvents = Object.entries(dbState)
  .filter(([_, state]) => state.status === 'IN_PROGRESS')
  .map(([eventName]) => eventName)

await cleanupInterruptedEvents(inProgressEvents)

// reactivate graph with saved state
graph.activate(savedState)
```

Events that were IN_PROGRESS during shutdown will automatically be rerun when the graph is reactivated. Before reactivating the graph, you should implement cleanup logic for any side effects that may have been created by interrupted events. IN_PROGRESS events are intentionally not restored from the saved state, as they need to be re-executed to ensure completion.

## API Reference

### DependencyGraph

- `registerEvent(type, dependencies, handler, options?)`
- `completeEvent(type, value?)`
- `activate(initialState?)`
- `getEventStatus(type)`
- `async waitForEvent(type)`
- `resetEvent(type, beforeReset?)`
    - this will reset the event and all its dependents, and refire the event. beforeReset is a function that takes in all events that will be reset; any side effects should be cleaned up here.

### GraphRegistry (steffi-viz)

- `getInstance()`
- `registerGraph(name, graph)`
- `startVisualizationServer(port)`

## Example

For a complete example, see the potion brewing simulation in the example directory.

## Development (requires pnpm)

```bash
pnpm install
pnpm run dev
```
