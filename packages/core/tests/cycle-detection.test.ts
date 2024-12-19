import { DependencyGraph } from '../src/DependencyGraph'

describe('DependencyGraph - Cycle Detection', () => {
  it('detects direct cycles', () => {
    const graph = new DependencyGraph<{
      initial: void
      event1: void
      event2: void
    }>()

    graph.registerEvent('event1', ['initial'], async () => {})

    expect(() => {
      graph.registerEvent('event2', ['event1'], async () => {})
      graph.registerEvent('event1', ['event2'], async () => {})
    }).toThrow(/cycle/)
  })

  it('detects indirect cycles', () => {
    const graph = new DependencyGraph<{
      initial: void
      event1: void
      event2: void
      event3: void
    }>()

    graph.registerEvent('event1', ['initial'], async () => {})
    graph.registerEvent('event2', ['event1'], async () => {})
    graph.registerEvent('event3', ['event2'], async () => {})

    expect(() => {
      graph.registerEvent('event1', ['event3'], async () => {})
    }).toThrow(/cycle/)
  })
}) 