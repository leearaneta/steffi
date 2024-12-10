import { DependencyGraph } from '../DependencyGraph'

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