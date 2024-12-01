import { DependencyGraph } from '../DependencyGraph'
import { EventStatus } from '../../types'

describe('DependencyGraph - Status Tracking', () => {
  it('tracks event status correctly through its lifecycle', async () => {
    const graph = new DependencyGraph<{
      initial: void
      event1: { value: number }
    }>()
    
    const getStatus = () => graph.getGraph().status

    graph.registerEvent('event1', ['initial'], async () => {
      await new Promise(resolve => setTimeout(resolve, 10))
    })

    expect(getStatus().get('event1')).toBe(EventStatus.PENDING)

    const completion = graph.completeEvent('initial')

    await new Promise(resolve => setImmediate(resolve))
    expect(getStatus().get('event1')).toBe(EventStatus.IN_PROGRESS)

    await completion
    expect(getStatus().get('event1')).toBe(EventStatus.COMPLETED)
  })

  it('marks event as FAILED when it throws', async () => {
    const graph = new DependencyGraph<{
      initial: void
      event1: void
    }>()

    graph.registerEvent('event1', ['initial'], async () => {
      throw new Error('test error')
    })

    try {
      await graph.completeEvent('initial')
    } catch (e) {
      // expected to throw
    }

    expect(graph.getGraph().status.get('event1')).toBe(EventStatus.FAILED)
  })
}) 