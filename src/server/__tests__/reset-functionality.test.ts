import { DependencyGraph } from '../DependencyGraph'
import { EventStatus } from '../../types'

describe('DependencyGraph - Reset Functionality', () => {
  it('resets an event and its dependents by name', async () => {
    const graph = new DependencyGraph<{
      initial: void
      event1: { value: number }
      event2: { value: number }
      event3: { value: number }
    }>()

    graph.registerEvent('event1', ['initial'], async () => {
      return { value: 1 }
    })
    graph.registerEvent('event2', ['event1'], async () => {
      return { value: 2 }
    })
    graph.registerEvent('event3', ['event2'], async () => {
      return { value: 3 }
    })

    await graph.completeEvent('initial')

    const statusBefore = graph.getGraph().status
    expect(statusBefore.get('event1')).toBe(EventStatus.COMPLETED)
    expect(statusBefore.get('event2')).toBe(EventStatus.COMPLETED)
    expect(statusBefore.get('event3')).toBe(EventStatus.COMPLETED)

    await graph.resetEvent('event1')

    const statusAfter = graph.getGraph().status
    expect(statusAfter.get('event1')).toBe(EventStatus.PENDING)
    expect(statusAfter.get('event2')).toBe(EventStatus.PENDING)
    expect(statusAfter.get('event3')).toBe(EventStatus.PENDING)
  })

  it('resets events completed before a specific time', async () => {
    const graph = new DependencyGraph<{
      event1: void
      event2: void
    }>()
  
    graph.registerEvent('event1', [], async () => { return 'completed' })
    const now = new Date()
    const pastTime = new Date(now.getTime() - 1000)
    const futureTime = new Date(now.getTime() + 1000)

    await new Promise(resolve => setTimeout(resolve, 50))
    graph.registerEvent('event2', [], async () => { return 'completed' })

  

    await graph.resetEventsAfterTime(futureTime)
  
    let status = graph.getGraph().status
    expect(status.get('event1')).toBe(EventStatus.COMPLETED)
    expect(status.get('event2')).toBe(EventStatus.COMPLETED)

    await graph.resetEventsAfterTime(now)
    status = graph.getGraph().status
    expect(status.get('event1')).toBe(EventStatus.COMPLETED)
    expect(status.get('event2')).toBe(EventStatus.PENDING)

    await graph.resetEventsAfterTime(pastTime)
    status = graph.getGraph().status
    expect(status.get('event1')).toBe(EventStatus.PENDING)
    expect(status.get('event2')).toBe(EventStatus.PENDING)
  })
}) 