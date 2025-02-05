import { DependencyGraph } from '../src/DependencyGraph'

describe('DependencyGraph - Reset Functionality', () => {
  it('resets an event and its dependents by name', async () => {
    const graph = new DependencyGraph<{
      initial: void
      event1: { value: number }
      event2: { value: number }
      event3: { value: number }
    }>()

    const event1Fn = jest.fn().mockResolvedValue({ value: 1 })
    const event2Fn = jest.fn().mockResolvedValue({ value: 2 })
    const event3Fn = jest.fn().mockResolvedValue({ value: 3 })

    graph.registerEvent('event1', [], event1Fn)
    graph.registerEvent('event2', ['event1'], event2Fn)
    graph.registerEvent('event3', ['event2'], event3Fn)

    graph.activate()
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(event1Fn).toHaveBeenCalledTimes(1)
    expect(event2Fn).toHaveBeenCalledTimes(1)
    expect(event3Fn).toHaveBeenCalledTimes(1)

    await graph.resetEvent('event1')
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(event1Fn).toHaveBeenCalledTimes(2)
    expect(event2Fn).toHaveBeenCalledTimes(2)
    expect(event3Fn).toHaveBeenCalledTimes(2)
  })

}) 