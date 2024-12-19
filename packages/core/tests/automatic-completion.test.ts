import { DependencyGraph } from '../DependencyGraph'
import { EventStatus } from '../../types'

describe('DependencyGraph - Automatic Completion', () => {
  it('automatically completes event when runnable finishes by default', async () => {
    const graph = new DependencyGraph<{
      dep1: string
      target: boolean
    }>()

    const mockRunnable = jest.fn().mockResolvedValue(undefined)
    graph.registerEvent('target', ['dep1'], mockRunnable)
    graph.activate()
    
    await graph.completeEvent('dep1', 'hello')
    await new Promise(resolve => setImmediate(resolve))

    expect(graph.getEventStatus('target')).toBe(EventStatus.COMPLETED)
  })

  it('does not automatically complete event when fireOnComplete is false', async () => {
    const graph = new DependencyGraph<{
      dep1: string
      target: boolean
    }>()

    const mockRunnable = jest.fn().mockResolvedValue(undefined)
    graph.registerEvent(
      'target',
      ['dep1'],
      mockRunnable,
      { fireOnComplete: false }
    )

    graph.activate()
    await graph.completeEvent('dep1', 'hello')

    await new Promise(resolve => setImmediate(resolve))

    expect(graph.getEventStatus('target')).toBe(EventStatus.IN_PROGRESS)

    await graph.completeEvent('target', true)
    expect(graph.getEventStatus('target')).toBe(EventStatus.COMPLETED)
  })
})
