import { z } from 'zod'
import { zodToJsonSchema } from 'zod-to-json-schema'

// This will be used to validate Claude's responses
type SchemaType = z.ZodType<any, any>

interface ClaudeOptions {
  apiKey?: string
  model?: string
  maxTokens?: number
  temperature?: number
}

export class Claude {
  private apiKey: string
  private model: string
  private maxTokens: number
  private temperature: number
  private baseUrl = 'https://api.anthropic.com/v1/messages'

  constructor(options: ClaudeOptions = {}) {
    this.apiKey = options.apiKey || process.env.ANTHROPIC_API_KEY || ''
    if (!this.apiKey) {
      throw new Error('Anthropic API key is required. Set it in constructor or ANTHROPIC_API_KEY env variable.')
    }
    this.model = options.model || 'claude-3-5-sonnet-latest'
    this.maxTokens = options.maxTokens || 4096
    this.temperature = options.temperature || 0.7
  }

  async chat<T>(
    messages: { role: 'user' | 'assistant', content: string }[],
    schema?: z.ZodSchema<T>
  ): Promise<typeof schema extends undefined ? string : T> {
    const systemMessage = schema ? 
      `You must respond with valid JSON that matches this JSON Schema:
${JSON.stringify(zodToJsonSchema(schema), null, 2)}

Your response should be ONLY the JSON object, nothing else.` : undefined

    console.log('System message:', systemMessage)

    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        max_tokens: this.maxTokens,
        temperature: this.temperature,
        system: systemMessage
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Claude API error:', errorText)
      throw new Error(`Claude API error: ${response.statusText}`)
    }

    const data = await response.json()
    
    if (schema) {
      try {
        const jsonResponse = JSON.parse(data.content[0].text)
        console.log('Claude response:', jsonResponse)
        return schema.parse(jsonResponse) as any
      } catch (error) {
        console.error('Response validation failed:', error)
        console.error('Raw response:', data.content[0].text)
        throw new Error(`Response validation failed: ${error}`)
      }
    }

    return data.content[0].text as any
  }

  // Helper method for single message conversations
  async complete<T>(
    prompt: string,
    schema?: z.ZodSchema<T>
  ): Promise<typeof schema extends undefined ? string : T> {
    return this.chat([{ role: 'user', content: prompt }], schema)
  }
}

// Example usage with a graph event:

// Example usage:
/*
const claude = new Claude({ apiKey: 'your-api-key' })

// With schema validation:
const recipe = await claude.complete(
  'Generate a recipe for a chocolate cake',
  recipeSchema
)
console.log(recipe.title) // TypeScript knows this exists!

// Without schema (free-form):
const response = await claude.complete('Tell me a joke')
console.log(response) // Plain text response
*/ 