import { EventStatus } from "../../types"
import { DependencyGraph } from "../DependencyGraph"

describe('DependencyGraph - Activation', () => {

  it('executes all no-dependency events upon activation', async () => {
    const graph = new DependencyGraph<{
      event1: void
      event2: void
      event3: void
    }>({ fireOnComplete: false })
    
    const handler1 = jest.fn()
    const handler2 = jest.fn()
    const handler3 = jest.fn()
    
    graph.registerEvent('event1', [], handler1)
    graph.registerEvent('event2', ['event1'], handler2)
    graph.registerEvent('event3', [], handler3)
    
    graph.activate()
    await new Promise(resolve => setTimeout(resolve, 50))
    
    expect(handler1).toHaveBeenCalled()
    expect(handler2).not.toHaveBeenCalled()
    expect(handler3).toHaveBeenCalled()
  })

  it('throws when registering events after activation', () => {
    const graph = new DependencyGraph<{
      event1: void
    }>()
    
    graph.activate()
    
    expect(() => {
      graph.registerEvent('event1', [], async () => {})
    }).toThrow('Cannot register events after graph has been activated')
  })

  it('loads initial state correctly', async () => {
    const graph = new DependencyGraph<{
      event1: { value: number }
      event2: { value: number }
    }>()
    
    const handler1 = jest.fn()
    const handler2 = jest.fn()
    
    graph.registerEvent('event1', [], handler1)
    graph.registerEvent('event2', ['event1'], handler2)
    
    const initialState = {
      completed: {
        event1: {
          at: new Date('2024-01-01'),
          value: { value: 42 }
        }
      },
      failed: {}
    }

    graph.activate(initialState)
    await new Promise(resolve => setTimeout(resolve, 50))
    
    expect(handler1).not.toHaveBeenCalled() // should not run since loaded from state
    expect(handler2).toHaveBeenCalledWith({ event1: { value: 42 } })
    expect(graph.getEventStatus('event1')).toBe(EventStatus.COMPLETED)
  })
}) 