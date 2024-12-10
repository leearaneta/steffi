import { DependencyGraph } from '../DependencyGraph'

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
          fn: ({ a, b }) => a + b > 10
        }
      ]
    })
    graph.activate()

    await graph.completeEvent('a', 3)
    await graph.completeEvent('b', 4)
    await new Promise(resolve => setImmediate(resolve))
    expect(mockRunnable).not.toHaveBeenCalled()

    await graph.completeEvent('a', 6)
    await graph.completeEvent('b', 5)
    await new Promise(resolve => setImmediate(resolve))
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
          fn: ({ a, b }) => a * b > 20
        }
      ]
    })

    await graph.completeEvent('a', 2)
    await graph.completeEvent('b', 3)
    await new Promise(resolve => setImmediate(resolve))
    expect(mockRunnable).not.toHaveBeenCalled()

    await graph.completeEvent('a', 5)
    await graph.completeEvent('b', 5)
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
          fn: ({ a, b }) => a + b > 10
        },
        {
          required: ['b', 'c'],
          fn: ({ b, c }) => b - c < 4
        }
      ]
    })

    await graph.completeEvent('a', 6)
    await graph.completeEvent('b', 5)
    await graph.completeEvent('c', 1)
    await new Promise(resolve => setImmediate(resolve))
    expect(mockRunnable).not.toHaveBeenCalled()

    // Complete dependencies with all predicates satisfied
    await graph.completeEvent('c', 3)
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
        fn: ({ b }) => b > 5
      }
    ]
  })

  await graph.completeEvent('a', 10)
  await new Promise(resolve => setImmediate(resolve))
  expect(mockRunnable).toHaveBeenCalledWith({
    a: 10
  })

  graph.resetEvent('a')
  mockRunnable.mockClear()

  await graph.completeEvent('b', 3)
  await new Promise(resolve => setImmediate(resolve))
  expect(mockRunnable).not.toHaveBeenCalled()

  await graph.completeEvent('b', 7)
  await new Promise(resolve => setImmediate(resolve))
  expect(mockRunnable).toHaveBeenCalledWith({
    b: 7
  })
}) 