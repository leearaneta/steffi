import { DependencyGraph } from '../DependencyGraph'
import { EventStatus } from '../../types'

describe('DependencyGraph - Event Deregistration', () => {
  interface TestEvents {
    initial: void
    event1: { value: number }
    event2: { value: number }
    event3: { value: number }
  }

  it('deregisters an event with no dependents', () => {
    const graph = new DependencyGraph<TestEvents>()
    const handler = jest.fn()

    graph.registerEvent('event1', ['initial'], handler)
    expect(graph.getEventStatus('event1')).toBe(EventStatus.PENDING)
    
    graph.deregisterEvent('event1')
    expect(graph.getEventStatus('event1')).toBeUndefined()
  })

  it('prevents deregistering events with dependents by default', () => {
    const graph = new DependencyGraph<TestEvents>()
    
    graph.registerEvent('event1', ['initial'], jest.fn())
    graph.registerEvent('event2', ['event1'], jest.fn())

    expect(() => graph.deregisterEvent('event1'))
      .toThrow(/has dependents/)
    expect(graph.getEventStatus('event1')).toBe(EventStatus.PENDING)
  })

  it('force deregisters an event while keeping its dependents', () => {
    const graph = new DependencyGraph<TestEvents>()
    
    graph.registerEvent('event1', ['initial'], jest.fn())
    graph.registerEvent('event2', ['event1'], jest.fn())
    graph.registerEvent('event3', ['event2'], jest.fn())

    graph.deregisterEvent('event1', { force: true })

    // event1 should be gone, but event2 and event3 should remain
    expect(graph.getEventStatus('event1')).toBeUndefined()
    expect(graph.getEventStatus('event2')).toBe(EventStatus.PENDING)
    expect(graph.getEventStatus('event3')).toBe(EventStatus.PENDING)
  })

  it('cascade deregisters an event and all its dependents', () => {
    const graph = new DependencyGraph<TestEvents>()
    
    graph.registerEvent('event1', ['initial'], jest.fn())
    graph.registerEvent('event2', ['event1'], jest.fn())
    graph.registerEvent('event3', ['event2'], jest.fn())

    graph.deregisterEvent('event1', { cascade: true })

    // All events should be removed
    expect(graph.getEventStatus('event1')).toBeUndefined()
    expect(graph.getEventStatus('event2')).toBeUndefined()
    expect(graph.getEventStatus('event3')).toBeUndefined()
  })
}) 