import { DependencyGraph } from "../DependencyGraph"

describe('DependencyGraph - Activation', () => {
  // it('does not execute events until activated', async () => {
  //   const graph = new DependencyGraph<{
  //     event1: void
  //   }>()
    
  //   const handler = jest.fn()
  //   graph.registerEvent('event1', [], handler)
    
  //   await new Promise(resolve => setTimeout(resolve, 50))
  //   expect(handler).not.toHaveBeenCalled()
    
  //   graph.activate()
  //   await new Promise(resolve => setTimeout(resolve, 50))
  //   expect(handler).toHaveBeenCalled()
  // })

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
    expect(handler2).not.toHaveBeenCalled() // Waiting for event1
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
}) 