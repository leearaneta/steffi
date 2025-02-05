import { DependencyGraph } from '../src/DependencyGraph'

describe('DependencyGraph - Predicate Dependencies', () => {
  it('executes event only when predicate is satisfied', async () => {
    const graph = new DependencyGraph<{
      a: number
      b: number
      target: string
    }>()

    const mockRunnable = jest.fn().mockResolvedValue('success')

    graph.registerEvent('target', ['a', 'b'], mockRunnable, {
      predicates: [
        {
          required: ['a', 'b'],
          fn: ({ a, b }) => a! + b! > 10,
          name: 'a + b > 10'
        }
      ]
    })
    graph.activate()

    graph.completeEvent('a', 3)
    graph.completeEvent('b', 4)
    await new Promise(resolve => setTimeout(resolve, 100))
    
    await graph.resetEvent('a')
    await graph.resetEvent('b')

    graph.completeEvent('a', 6)
    graph.completeEvent('b', 5)
    await new Promise(resolve => setTimeout(resolve, 100))
    expect(mockRunnable).toHaveBeenCalledWith({
      a: 6,
      b: 5
    })
  })

  it('does not execute event if predicate fails', async () => {
    const graph = new DependencyGraph<{
      a: number
      b: number
      target: string
    }>()

    const mockRunnable = jest.fn().mockResolvedValue('success')

    graph.registerEvent('target', ['a', 'b'], mockRunnable, {
      predicates: [
        {
          required: ['a', 'b'],
          fn: ({ a, b }) => a! * b! > 20,
          name: 'a * b > 20'
        }
      ]
    })

    graph.activate()

    graph.completeEvent('a', 2)
    graph.completeEvent('b', 3)
    await new Promise(resolve => setImmediate(resolve))
    expect(mockRunnable).not.toHaveBeenCalled()

    await graph.resetEvent('a')
    await graph.resetEvent('b')

    graph.completeEvent('a', 5)
    graph.completeEvent('b', 5)
    await new Promise(resolve => setImmediate(resolve))
    expect(mockRunnable).toHaveBeenCalledWith({
      a: 5,
      b: 5
    })
  })

  it('executes event when multiple predicates are satisfied', async () => {
    const graph = new DependencyGraph<{
      a: number
      b: number
      c: number
      target: string
    }>()

    const mockRunnable = jest.fn().mockResolvedValue('success')

    graph.registerEvent('target', ['a', 'b', 'c'], mockRunnable, {
      predicates: [
        {
          required: ['a', 'b'],
          fn: ({ a, b }) => a! + b! > 10,
          name: 'a + b > 10'
        },
        {
          required: ['b', 'c'],
          fn: ({ b, c }) => b! - c! < 4,
          name: 'b - c < 4'
        }
      ]
    })

    graph.activate()

    graph.completeEvent('a', 6)
    graph.completeEvent('b', 5)
    graph.completeEvent('c', 1)
    await new Promise(resolve => setImmediate(resolve))
    expect(mockRunnable).not.toHaveBeenCalled()

    await graph.resetEvent('c')

    graph.completeEvent('c', 3)
    await new Promise(resolve => setImmediate(resolve))
    expect(mockRunnable).toHaveBeenCalledWith({
      a: 6,
      b: 5,
      c: 3
    })
  })
})

it('executes event when OR condition is met, but predicate only affects specific dependency', async () => {
  const graph = new DependencyGraph<{
    a: number
    b: number
    target: string
  }>()

  const mockRunnable = jest.fn().mockResolvedValue('success')

  // Event can be triggered by either 'a' OR 'b'
  // Predicate only applies if 'b' is completed
  graph.registerEvent('target', [
    { or: [['a'], ['b']] }
  ], mockRunnable, {
    predicates: [
      {
        required: ['b'],
        fn: ({ b }) => b! > 5,
        name: 'b > 5'
      }
    ]
  })

  graph.activate()
  graph.completeEvent('a', 10)
  await new Promise(resolve => setImmediate(resolve))
  expect(mockRunnable).toHaveBeenCalledWith({
    a: 10
  })

  await graph.resetEvent('a')

  graph.completeEvent('b', 3)
  await new Promise(resolve => setImmediate(resolve))
  expect(mockRunnable).toHaveBeenCalledTimes(1)

  await graph.resetEvent('b')

  graph.completeEvent('b', 7)
  await new Promise(resolve => setImmediate(resolve))
  expect(mockRunnable).toHaveBeenCalledTimes(2)
})