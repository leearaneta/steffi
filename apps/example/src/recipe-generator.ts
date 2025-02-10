import { config } from 'dotenv'
import { BaseEventPayloads, DependencyGraph, GraphRegistry } from 'steffi'
import { z } from 'zod'
import { Claude } from './utils/claude'

// Load environment variables
config()

// Define schemas first, then infer types from them
export const recipeSchema = z.object({
  title: z.string(),
  ingredients: z.array(z.string()),
  steps: z.array(z.string()),
  cookingTime: z.number(),
  difficulty: z.enum(['easy', 'medium', 'hard'])
})

export const validateIngredientsSchema = z.object({
  availableIngredients: z.array(z.string()),
  missingIngredients: z.array(z.string())
})

export const estimateCostSchema = z.object({
  totalCost: z.number(),
  costPerServing: z.number(),
  servings: z.number()
})

// Infer types from schemas
type Recipe = z.infer<typeof recipeSchema>
type ValidateIngredients = z.infer<typeof validateIngredientsSchema>
type EstimateCost = z.infer<typeof estimateCostSchema>

// Define our event interface using the inferred types
interface RecipeEvents {
  init: void
  generateRecipe: Recipe
  validateIngredients: ValidateIngredients
  estimateCost: EstimateCost
}

const graph = new DependencyGraph<RecipeEvents>()
const claude = new Claude()

// Initialize with user preferences or constraints
graph.registerEvent('init', [], async () => {
  console.log('Initializing recipe generation...')
})

// Generate recipe using Claude
graph.registerEvent('generateRecipe', ['init'], async () => {
  console.log('Generating recipe...')
  return claude.complete(
    'Generate a recipe for a healthy vegetarian dinner that takes less than 30 minutes to prepare.',
    recipeSchema
  )
})

// Validate ingredients against a hypothetical pantry
graph.registerEvent('validateIngredients', ['generateRecipe'], async (deps) => {
  if (!deps.generateRecipe) {
    throw new Error('Recipe not generated')
  }

  console.log('Validating ingredients...')
  // Simulate checking against a pantry
  const pantry = new Set(['olive oil', 'salt', 'pepper', 'garlic', 'onion'])
  
  const availableIngredients = deps.generateRecipe.ingredients.filter(i => 
    pantry.has(i.toLowerCase())
  )
  
  const missingIngredients = deps.generateRecipe.ingredients.filter(i => 
    !pantry.has(i.toLowerCase())
  )

  // Validate the output against our schema
  return validateIngredientsSchema.parse({
    availableIngredients,
    missingIngredients
  })
})

// Estimate recipe cost
graph.registerEvent('estimateCost', ['generateRecipe', 'validateIngredients'], async (deps) => {
  if (!deps.generateRecipe) {
    throw new Error('Recipe not generated')
  }

  console.log('Estimating cost...')
  // Simulate cost calculation
  const avgIngredientCost = 3.50
  const totalCost = deps.generateRecipe.ingredients.length * avgIngredientCost
  const servings = 4 // Could be more dynamic

  // Validate the output against our schema
  return estimateCostSchema.parse({
    totalCost,
    costPerServing: totalCost / servings,
    servings
  })
})

// Register with visualization
const registry = GraphRegistry.getInstance()
registry.registerGraph('recipe-generator', graph)
registry.startVisualizationServer(3000, { dev: true })

// Start the graph
graph.activate() 