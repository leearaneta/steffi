import { DependencyGraph } from '../DependencyGraph'

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

    graph.registerEvent('event1', ['initial'], event1Fn)
    graph.registerEvent('event2', ['event1'], event2Fn)
    graph.registerEvent('event3', ['event2'], event3Fn)

    await graph.completeEvent('initial')
    await new Promise(resolve => setTimeout(resolve, 0))

    // Verify initial execution
    expect(event1Fn).toHaveBeenCalledTimes(1)
    expect(event2Fn).toHaveBeenCalledTimes(1)
    expect(event3Fn).toHaveBeenCalledTimes(1)

    await graph.resetEvent('event1')
    await new Promise(resolve => setTimeout(resolve, 0))

    // Verify events were rerun after reset
    expect(event1Fn).toHaveBeenCalledTimes(2)
    expect(event2Fn).toHaveBeenCalledTimes(2)
    expect(event3Fn).toHaveBeenCalledTimes(2)
  })

  it('resets events completed before a specific time', async () => {
    const graph = new DependencyGraph<{
      event1: void
      event2: void
    }>()
  
    const event1Fn = jest.fn().mockResolvedValue('completed')
    const event2Fn = jest.fn().mockResolvedValue('completed')

    graph.registerEvent('event1', [], event1Fn)
    const now = new Date()
    const pastTime = new Date(now.getTime() - 1000)
    const futureTime = new Date(now.getTime() + 1000)

    // Wait for event1 to complete
    await new Promise(resolve => setTimeout(resolve, 50))

    graph.registerEvent('event2', [], event2Fn)
    // Wait for event2 to complete
    await new Promise(resolve => setTimeout(resolve, 50))

    // Verify initial state
    expect(event1Fn).toHaveBeenCalledTimes(1)
    expect(event2Fn).toHaveBeenCalledTimes(1)

    await graph.resetEventsAfterTime(futureTime)
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(event1Fn).toHaveBeenCalledTimes(1) // No change
    expect(event2Fn).toHaveBeenCalledTimes(1) // No change

    await graph.resetEventsAfterTime(now)
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(event1Fn).toHaveBeenCalledTimes(1) // No change
    expect(event2Fn).toHaveBeenCalledTimes(2) // event2 rerun

    await graph.resetEventsAfterTime(pastTime)
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(event1Fn).toHaveBeenCalledTimes(2) // event1 rerun
    expect(event2Fn).toHaveBeenCalledTimes(3) // event2 rerun again
  })
}) 