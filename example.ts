import { DependencyGraph } from './packages/core/dist'
import { GraphRegistry } from './packages/viz/src/GraphRegistry'

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
  const timeSeconds = Math.floor(Math.random() * (450 - 150 + 1)) + 150
  console.log(`Heating solution to reaction temperature (${timeSeconds} seconds)...`)
  await new Promise(resolve => setTimeout(resolve, 1000))
  return {
    temperatureC: 82.5,
    timeSeconds
  }
})


graph.registerEvent(
  'dissolveReagent',
  ['heatSolution'],
  async () => {
    console.log('Dissolving primary reagent...')
    await new Promise(resolve => setTimeout(resolve, 1200))
    return {
      solubilityMgL: 145.2,
      dissolutionRate: 0.85
    }
  },
  { predicates: [{
    name: 'heating longer than 300s',
    fn: ({ heatSolution }) => heatSolution.timeSeconds > 300
  }] }
)

graph.registerEvent(
  'addBase',
  ['heatSolution'],
  async () => {
    console.log(`Adding base compound...`)
    await new Promise(resolve => setTimeout(resolve, 1500))
    return {
      pH: 8.2,
      volume: 500,
      concentration: 0.1
    }
  },
  { predicates: [{
    name: 'heating less than 300s',
    fn: ({ heatSolution }) => heatSolution.timeSeconds <= 300
  }] }
)

graph.registerEvent('catalyze', [
  { or: [
    ['addBase'],
    ['dissolveReagent']
  ]}
], async () => {
  console.log('Adding catalyst to accelerate reaction...')
  await new Promise(resolve => setTimeout(resolve, 800))
  return {
    reactionRate: 1.23,
    yield: 0.89
  }
})

graph.registerEvent('stabilize', ['catalyze'], async () => {
  console.log('Stabilizing the reaction mixture...')
  await new Promise(resolve => setTimeout(resolve, 1000))
  return {
    halfLife: 48.5,
    stability: 0.95
  }
})

graph.registerEvent('analyze', ['stabilize'], async () => {
  console.log('Analyzing final product...')
  await new Promise(resolve => setTimeout(resolve, 500))
  return {
    composition: {
      'active-compound': 0.82,
      'stabilizer': 0.15,
      'impurities': 0.03
    },
    purity: 0.97,
    yield: 0.85,
    shelfLife: 180
  }
})

const registry = GraphRegistry.getInstance()
registry.registerGraph('potion-brewing', graph)
registry.startVisualizationServer(3000, { dev: true })

graph.activate()
