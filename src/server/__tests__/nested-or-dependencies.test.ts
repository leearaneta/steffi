import { DependencyGraph } from '../DependencyGraph'

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