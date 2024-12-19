import { DependencyGraph } from '../src/DependencyGraph'

it('handles shared dependencies between OR groups', async () => {
    const graph = new DependencyGraph<{
      coffee: string
      car: string
      parkingPass: string
      carpool: string
      target: string
    }>()
    
    const mockRunnable = jest.fn().mockResolvedValue('success')

    graph.registerEvent('target', [
      'coffee',
      { or: [['carpool'], ['car', 'parkingPass']] }
    ], mockRunnable)
    graph.activate()

    // have predicate at top level
    // OR must contains subarrays

    // Complete shared dependency first
    await graph.completeEvent('coffee', 'espresso')
    await new Promise(resolve => setImmediate(resolve))
    expect(mockRunnable).not.toHaveBeenCalled()

    // Complete carpool group
    await graph.completeEvent('carpool', 'with-bob')
    await new Promise(resolve => setImmediate(resolve))

    expect(mockRunnable).toHaveBeenCalledWith({
      coffee: 'espresso',
      carpool: 'with-bob'
    })
}) 

describe('DependencyGraph - Nested OR Dependencies', () => {
  it('handles deeply nested OR groups', async () => {
    const graph = new DependencyGraph<{
      a: string
      b: string
      c: string
      d: string
      e: string
      f: string
      target: string
    }>()
    
    const mockRunnable = jest.fn().mockResolvedValue('success')

    graph.registerEvent('target', [
      'a',
      { or: [
        ['b'],
        ['c', { or: [
          ['d'],
          ['e', 'f']
        ]}]
      ]}
    ], mockRunnable)

    graph.activate()

    await graph.completeEvent('a', 'value-a')
    await new Promise(resolve => setImmediate(resolve))
    expect(mockRunnable).not.toHaveBeenCalled()

    await graph.completeEvent('b', 'value-b')
    await new Promise(resolve => setImmediate(resolve))
    expect(mockRunnable).toHaveBeenCalledWith({
      a: 'value-a',
      b: 'value-b'
    })
  })

  it('handles multiple nested OR paths', async () => {
    const graph = new DependencyGraph<{
      a: string
      b: string
      c: string
      d: string
      e: string
      target: string
    }>()
    
    const mockRunnable = jest.fn().mockResolvedValue('success')

    graph.registerEvent('target', [
      'a',
      { or: [
        ['b', { or: [['c'], ['d']] }],
        ['e']
      ]}
    ], mockRunnable)

    graph.activate()

    await graph.completeEvent('a', 'value-a')
    await new Promise(resolve => setImmediate(resolve))
    expect(mockRunnable).not.toHaveBeenCalled()

    await graph.completeEvent('b', 'value-b')
    await new Promise(resolve => setImmediate(resolve))
    expect(mockRunnable).not.toHaveBeenCalled()

    await graph.completeEvent('c', 'value-c')
    await new Promise(resolve => setImmediate(resolve))
    expect(mockRunnable).toHaveBeenCalledWith({
      a: 'value-a',
      b: 'value-b',
      c: 'value-c'
    })
  })

  it('handles alternative paths in nested ORs', async () => {
    const graph = new DependencyGraph<{
      a: string
      b: string
      c: string
      d: string
      e: string
      f: string
      target: string
    }>()
    
    const mockRunnable = jest.fn().mockResolvedValue('success')

    graph.registerEvent('target', [
      'a',
      { or: [
        ['b', { or: [['c'], ['d']] }],
        ['e', 'f']
      ]}
    ], mockRunnable)

    graph.activate()

    await graph.completeEvent('a', 'value-a')
    await new Promise(resolve => setImmediate(resolve))
    expect(mockRunnable).not.toHaveBeenCalled()

    await graph.completeEvent('e', 'value-e')
    await graph.completeEvent('f', 'value-f')
    await new Promise(resolve => setImmediate(resolve))
    expect(mockRunnable).toHaveBeenCalledWith({
      a: 'value-a',
      e: 'value-e',
      f: 'value-f'
    })
  })
}) 