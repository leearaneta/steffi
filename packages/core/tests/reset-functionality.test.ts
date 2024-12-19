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

  it('resets events completed after specified time', async () => {
    const graph = new DependencyGraph<{
      initial: void
      event1: { value: number }
      event2: void
      event3: void
    }>()

    const event1Fn = jest.fn().mockResolvedValue({ value: 1 })

    let event2CalledCount = 0
    const event2Fn = async function() {
      await new Promise(resolve => setTimeout(resolve, 50))
      event2CalledCount++
    }
    let event3CalledCount = 0
    const event3Fn = async function() {
      await new Promise(resolve => setTimeout(resolve, 50))
      event3CalledCount++
    }

    graph.registerEvent('event1', [], event1Fn)
    graph.registerEvent('event2', ['event1'], event2Fn)
    graph.registerEvent('event3', ['event1'], event3Fn)

    graph.activate()
    const timeBeforeSecondEvent = new Date()
    await new Promise(resolve => setTimeout(resolve, 100))
    await graph.resetEventsAfterTime(timeBeforeSecondEvent)
    await new Promise(resolve => setTimeout(resolve, 100))

    expect(event1Fn).toHaveBeenCalledTimes(1) // not reset
    expect(event2CalledCount).toBe(2)
    expect(event3CalledCount).toBe(2)
  })
}) 