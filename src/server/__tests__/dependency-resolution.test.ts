import { DependencyGraph } from '../DependencyGraph'

describe('DependencyGraph - Dependency Resolution', () => {
  interface TestEvents {
    initial: void
    event1: { value: number }
    event2: { value: number }
    event3: { value: number }
  }

  it('runs event only when all dependencies are completed', async () => {
    const graph = new DependencyGraph<TestEvents>()
    const event2Handler = jest.fn()
    const event3Handler = jest.fn()

    graph.registerEvent('event2', ['event1'], event2Handler)
    graph.registerEvent('event3', ['event1', 'event2', 'initial'], event3Handler)

    await graph.completeEvent('event1', { value: 1 })

    expect(event2Handler).toHaveBeenCalledWith({ event1: { value: 1 } })
    expect(event3Handler).not.toHaveBeenCalled()
  })
}) 