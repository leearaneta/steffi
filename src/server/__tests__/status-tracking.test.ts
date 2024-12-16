import { DependencyGraph } from '../DependencyGraph'
import { EventStatus } from '../../types'

describe('DependencyGraph - Status Tracking', () => {
  it('tracks event status correctly through its lifecycle', async () => {
    const graph = new DependencyGraph<{
      initial: void
      event1: { value: number }
    }>()
    
    graph.registerEvent('event1', [], async () => {
      await new Promise(resolve => setTimeout(resolve, 10))
    })

    expect(graph.getEventStatus('event1')).toBe(EventStatus.PENDING)
    graph.activate()
    expect(graph.getEventStatus('event1')).toBe(EventStatus.IN_PROGRESS)
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(graph.getEventStatus('event1')).toBe(EventStatus.COMPLETED)
  })

  it('marks event as FAILED when it throws', async () => {
    const graph = new DependencyGraph<{
      initial: void
      event1: void
    }>()

    graph.registerEvent('event1', [], async () => {
      throw new Error('test error')
    })
    
    graph.activate()
    try {
      await graph.waitForEvent('event1')
    } catch (e) {
      // expected to throw
    }

    expect(graph.getEventStatus('event1')).toBe(EventStatus.FAILED)
  })
}) 