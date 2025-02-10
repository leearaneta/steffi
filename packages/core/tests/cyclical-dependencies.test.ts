import { DependencyGraph } from '../src/DependencyGraph'
import type { GraphState } from '../src/types'

interface TestEvents {
  init: void
  a: string
  b: string
  c: string
}

describe('Cyclical Dependencies', () => {
  // it('should respect maxRuns in cyclic dependencies', async () => {
  //   const graph = new DependencyGraph<TestEvents>({ allowCycles: true })
  //   const runs = {
  //     a: 0,
  //     b: 0
  //   }

  //   graph.registerEvent('init', [], async () => {})

  //   graph.registerEvent('a', [{ or: [['init'], ['b']] }], async () => {
  //     runs.a++
  //     return `a${runs.a}`
  //   }, { maxRuns: 3 })

  //   graph.registerEvent('b', ['a'], async () => {
  //     runs.b++
  //     return `b${runs.b}`
  //   })

  //   graph.activate()

  //   // Wait for a to hit maxRuns
  //   await new Promise(resolve => setTimeout(resolve, 100))

  //   const state = graph.getGraph()
  //   expect(state.completedEvents.a).toHaveLength(3) // maxRuns = 3
  //   expect(state.completedEvents.b).toHaveLength(3) // if a runs 3 times, b runs 3 times
  //   expect(runs.a).toBe(3)
  //   expect(runs.b).toBe(3)
  // })

  it('should allow a cycle that stops based on graph state predicate', async () => {
    const MAX_B_RUNS = 3
    const graph = new DependencyGraph<TestEvents>({ allowCycles: true })
    const runs = {
      a: 0,
      b: 0,
      c: 0
    }

    graph.registerEvent('init', [], async () => {})

    graph.registerEvent('a', [{ or: [['init'], ['b']] }], async () => {
      runs.a++
      return `a${runs.a}`
    })

    // B depends on A but stops after MAX_B_RUNS
    graph.registerEvent('b', ['a'], async () => {
      runs.b++
      return `b${runs.b}`
    }, {
      predicates: [{
        name: 'stopAfterMaxRuns',
        fn: (_values, graphState: GraphState) => {
          const bRuns = graphState.completedEvents.b?.length ?? 0
          return bRuns < MAX_B_RUNS
        }
      }]
    })

    // C depends on either A or B and only runs when B has completed MAX_B_RUNS
    graph.registerEvent('c', [{ or: [['a'], ['b']] }], async () => {
      runs.c++
      return `c${runs.c}`
    }, {
      predicates: [{
        name: 'runAfterBCompletes',
        fn: (_values, graphState: GraphState) => {
          const bRuns = graphState.completedEvents.b?.length ?? 0
          return bRuns === MAX_B_RUNS && graphState.completedEvents.c.length === 0
        }
      }]
    })

    // Break the cycle by completing a
    graph.activate()

    // Wait for the cycle to complete and C to run
    await new Promise(resolve => setTimeout(resolve, 100))

    const state = graph.getGraph()
    expect(state.completedEvents.b).toHaveLength(MAX_B_RUNS)
    expect(state.completedEvents.a).toHaveLength(MAX_B_RUNS + 1) // a is fired first
    expect(state.completedEvents.c).toHaveLength(1) // runs after b completes MAX_B_RUNS
    
    expect(runs.b).toBe(MAX_B_RUNS)
    expect(runs.a).toBe(MAX_B_RUNS + 1)
    expect(runs.c).toBe(1)
  })

  // it('should allow cycles with multiple paths', async () => {
  //   const graph = new DependencyGraph<TestEvents>({ allowCycles: true })
  //   const sequence: string[] = []

  //   // Create a cycle with multiple paths:
  //   // A -> B -> A
  //   // A -> C -> B -> A

  //   graph.registerEvent('init', [], async () => {})

  //   graph.registerEvent('a', [{ or: [['b', 'c'], ['init']] }], async () => {
  //     sequence.push('a')
  //     return 'a'
  //   })

  //   graph.registerEvent('b', ['a'], async () => {
  //     sequence.push('b')
  //     return 'b'
  //   })

  //   graph.registerEvent('c', ['b'], async () => {
  //     sequence.push('c')
  //     return 'c'
  //   })

  //   graph.activate()

  //   // Let it run for a bit
  //   await new Promise(resolve => setTimeout(resolve, 100))

  //   // Verify that events executed in the expected order
  //   expect(sequence).toContain('a')
  //   expect(sequence).toContain('b')
  //   expect(sequence).toContain('c')
    
  //   // Verify that b always comes after a in the sequence
  //   const aIndices = sequence
  //     .map((event, index) => event === 'a' ? index : -1)
  //     .filter(index => index !== -1)
    
  //   const bIndices = sequence
  //     .map((event, index) => event === 'b' ? index : -1)
  //     .filter(index => index !== -1)

  //   aIndices.forEach((aIndex, i) => {
  //     if (i < aIndices.length - 1) {
  //       const nextBIndex = bIndices.find(bIndex => bIndex > aIndex)
  //       expect(nextBIndex).toBeDefined()
  //     }
  //   })
  // })
}) 