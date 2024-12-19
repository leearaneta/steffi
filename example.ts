import { DependencyGraph, GraphRegistry } from '../src'

interface PotionBrewing {
  heatSolution: {
    temperatureC: number
    timeSeconds: number
  }
  addBase: {
    pH: number
    volume: number
    concentration: number
  }
  dissolveReagent: {
    solubilityMgL: number
    dissolutionRate: number
  }
  catalyze: {
    reactionRate: number
    yield: number
  }
  stabilize: {
    halfLife: number
    stability: number
  }
  analyze: {
    composition: Record<string, number>
    purity: number
    yield: number
    shelfLife: number
  }
}

const graph = new DependencyGraph<PotionBrewing>({ maxRetries: 0 })

graph.registerEvent('heatSolution', [], async () => {
  console.log('Heating solution to reaction temperature...')
  await new Promise(resolve => setTimeout(resolve, 1000))
  return {
    temperatureC: 82.5,
    timeSeconds: 300
  }
})

graph.registerEvent('addBase', ['heatSolution'], async (args) => {
  console.log(`Solution at ${args.heatSolution.temperatureC}°C, adding base compound...`)
  await new Promise(resolve => setTimeout(resolve, 1500))
  return {
    pH: 8.2,
    volume: 500,
    concentration: 0.1
  }
})

graph.registerEvent('dissolveReagent', ['addBase'], async ({ addBase }) => {
  console.log(`pH stabilized at ${addBase.pH}, introducing primary reagent...`)
  await new Promise(resolve => setTimeout(resolve, 800))
  return {
    solubilityMgL: 145.2,
    dissolutionRate: 0.23
  }
})

graph.registerEvent('catalyze', ['dissolveReagent'], async ({ dissolveReagent }) => {
  console.log(`Reagent dissolved at ${dissolveReagent.solubilityMgL}mg/L, beginning catalysis...`)
  await new Promise(resolve => setTimeout(resolve, 1200))
  return {
    reactionRate: 0.42,
    yield: 0.89
  }
})

graph.registerEvent('stabilize', ['catalyze'], async ({ catalyze }) => {
  console.log(`Reaction yielded ${catalyze.yield * 100}%, stabilizing solution...`)
  await new Promise(resolve => setTimeout(resolve, 1000))
  return {
    halfLife: 2160,
    stability: 0.95
  }
})

graph.registerEvent('analyze', 
  ['addBase', 'dissolveReagent', 'catalyze', 'stabilize'], 
  async ({ addBase, dissolveReagent, catalyze, stabilize }) => {
    console.log('\nFinal Analysis:')
    console.log('------------------------')
    console.log(`Base pH: ${addBase.pH}`)
    console.log(`Reagent Solubility: ${dissolveReagent.solubilityMgL}mg/L`)
    console.log(`Reaction Yield: ${(catalyze.yield * 100).toFixed(1)}%`)
    console.log(`Stability Score: ${(stabilize.stability * 100).toFixed(1)}%`)
    console.log('------------------------')

    return {
      composition: {
        'active-compound': 0.82,
        'stabilizer': 0.15,
        'carrier': 0.03
      },
      purity: 0.982,
      yield: catalyze.yield,
      shelfLife: stabilize.halfLife * stabilize.stability
    }
})

const registry = GraphRegistry.getInstance()
registry.registerGraph('synthesis', graph)
registry.startVisualizationServer(3000)
graph.activate()

console.log('Visualization server started at http://localhost:3000')
console.log('Beginning synthesis process...\n')
