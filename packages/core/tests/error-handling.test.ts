import { DependencyGraph } from '../src/DependencyGraph'

describe('DependencyGraph - Error Handling', () => {
  it('retries failed events up to maxRetries', async () => {
    const graph = new DependencyGraph<{
      initial: void
      event1: void
    }>()

    let tries = 0

    graph.registerEvent('event1', [], async () => {
      tries++
      if (tries < 2) {
        throw new Error('failure')
      }
    }, {
      maxRetries: 2,
      retryDelay: 10
    })
    graph.activate()

    await graph.waitForEvent('event1')

    expect(tries).toBe(2)
    expect(graph.getEventStatus('event1')).toBe('COMPLETED')
  })

  it('fails after maxRetries attempts', async () => {
    const graph = new DependencyGraph<{
      initial: void
      event1: void
    }>()

    const handler = jest.fn().mockRejectedValue(new Error('always fail'))

    graph.registerEvent('event1', [], handler, {
      maxRetries: 2,
      retryDelay: 10
    })

    graph.activate()

    try {
      await graph.waitForEvent('event1')
    } catch (e) {
      // expected to throw
    }

    expect(handler).toHaveBeenCalledTimes(3) // initial + 2 retries
    expect(graph.getEventStatus('event1')).toBe('FAILED')
  })

  it('fails on timeout', async () => {
    const graph = new DependencyGraph<{
      initial: void
      event1: void
    }>()

    graph.registerEvent('event1', [], async () => {
      await new Promise(resolve => setTimeout(resolve, 10000))
    }, {
      timeout: 10
    })
    graph.activate()

    try {
      await graph.waitForEvent('event1')
    } catch (e) {
      expect(e).toContain('timed out')
    }

    expect(graph.getEventStatus('event1')).toBe('FAILED')
  })
}) 