import { DependencyGraph } from '../DependencyGraph'
import { EventStatus } from '../../types'

describe('DependencyGraph - Automatic Completion', () => {
  it('automatically completes event when runnable finishes by default', async () => {
    const graph = new DependencyGraph<{
      dep1: string
      target: boolean
    }>()

    await graph.completeEvent('dep1', 'hello')

    const mockRunnable = jest.fn().mockResolvedValue(undefined)
    graph.registerEvent(
      'target',
      ['dep1'],
      mockRunnable
    )

    await new Promise(resolve => setImmediate(resolve))

    expect(graph.getEventStatus('target')).toBe(EventStatus.COMPLETED)
  })

  it('does not automatically complete event when fireOnComplete is false', async () => {
    const graph = new DependencyGraph<{
      dep1: string
      target: boolean
    }>()

    await graph.completeEvent('dep1', 'hello')

    const mockRunnable = jest.fn().mockResolvedValue(undefined)
    graph.registerEvent(
      'target',
      ['dep1'],
      mockRunnable,
      { fireOnComplete: false }
    )

    await new Promise(resolve => setImmediate(resolve))

    expect(graph.getEventStatus('target')).toBe(EventStatus.IN_PROGRESS)

    await graph.completeEvent('target', true)
    expect(graph.getEventStatus('target')).toBe(EventStatus.COMPLETED)
  })
})
