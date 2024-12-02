import { DependencyGraph } from '../DependencyGraph'
import { EventStatus } from '../../types'

describe('DependencyGraph - Error Handling', () => {
  it('retries failed events up to maxRetries', async () => {
    const graph = new DependencyGraph<{
      initial: void
      event1: void
    }>()

    let tries = 0

    graph.registerEvent('event1', ['initial'], async () => {
      tries++
      if (tries < 2) {
        throw new Error('failure')
      }
    }, {
      maxRetries: 2,
      retryDelay: 10
    })

    await graph.completeEvent('initial')

    expect(tries).toBe(2)
    expect(graph.getEventStatus('event1')).toBe(EventStatus.COMPLETED)
  })

  it('fails after maxRetries attempts', async () => {
    const graph = new DependencyGraph<{
      initial: void
      event1: void
    }>()

    const handler = jest.fn().mockRejectedValue(new Error('always fail'))

    graph.registerEvent('event1', ['initial'], handler, {
      maxRetries: 2,
      retryDelay: 10
    })

    try {
      await graph.completeEvent('initial')
    } catch (e) {
      // expected to throw
    }

    expect(handler).toHaveBeenCalledTimes(3) // initial + 2 retries
    expect(graph.getEventStatus('event1')).toBe(EventStatus.FAILED)
  })

  it('fails on timeout', async () => {
    const graph = new DependencyGraph<{
      initial: void
      event1: void
    }>()

    graph.registerEvent('event1', ['initial'], async () => {
      await new Promise(resolve => setTimeout(resolve, 50))
    }, {
      timeout: 10
    })

    try {
      await graph.completeEvent('initial')
    } catch (e) {
      expect(e.message).toContain('timed out')
    }

    expect(graph.getEventStatus('event1')).toBe(EventStatus.FAILED)
  })
}) 