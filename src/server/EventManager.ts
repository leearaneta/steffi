import { EventEmitter } from 'events'
import { BaseEventPayloads, DependencyGraphOptions, EventStatus, EventError } from '../types'

export class EventManager<TEventPayloads extends BaseEventPayloads> {
  private runnables: Map<keyof TEventPayloads, (args: any) => Promise<void>> = new Map()
  private completedEvents: Map<keyof TEventPayloads, any> = new Map()
  private eventOptions: Map<keyof TEventPayloads, Required<DependencyGraphOptions>> = new Map()
  private eventStatus: Map<keyof TEventPayloads, EventStatus> = new Map()
  private readonly defaultOptions: Required<DependencyGraphOptions>
  private errors = new Map<keyof TEventPayloads, EventError>()

  constructor(
    private emitter: EventEmitter,
    options: DependencyGraphOptions = {}
  ) {
    this.defaultOptions = {
      maxRetries: options.maxRetries ?? 3,
      retryDelay: options.retryDelay ?? 1000,
      timeout: options.timeout ?? 30000
    }
  }

  registerEvent(
    type: keyof TEventPayloads,
    runnable?: (args: any) => Promise<void>,
    options: DependencyGraphOptions = {}
  ) {
    const mergedOptions = {
      ...this.defaultOptions,
      ...options
    }
    this.eventOptions.set(type, mergedOptions)
    this.runnables.set(type, runnable || (() => Promise.resolve()))
    this.eventStatus.set(type, EventStatus.PENDING)
  }

  deregisterEvent(type: keyof TEventPayloads) {
    this.runnables.delete(type)
    this.completedEvents.delete(type)
    this.eventOptions.delete(type)
    this.eventStatus.delete(type)
    this.errors.delete(type)
  }

  async completeEvent(type: keyof TEventPayloads, value?: any) {
    this.completedEvents.set(type, { at: new Date(), value })
    this.eventStatus.set(type, EventStatus.COMPLETED)
    this.emitter.emit('eventCompleted', type, value)
    this.errors.delete(type)
  }

  async executeEvent(type: keyof TEventPayloads, value?: any) {
    const options = this.eventOptions.get(type)!
    const { maxRetries, retryDelay, timeout } = options || this.defaultOptions

    const executeWithRetries = async (retryCount = 0): Promise<void> => {
      try {
        this.eventStatus.set(type, EventStatus.IN_PROGRESS)
        this.emitter.emit('eventStarted', type)
        
        const timeoutPromise = new Promise<void>((_, reject) => {
          setTimeout(() => reject(new Error(`Event ${String(type)} timed out after ${timeout}ms`)), timeout)
        })

        const runnable = this.runnables.get(type)
        if (runnable) {
          await Promise.race([
            runnable(value),
            timeoutPromise
          ])
        }

      } catch (error) {
        if (retryCount < maxRetries) {
          this.eventStatus.set(type, EventStatus.PENDING)
          await new Promise(resolve => setTimeout(resolve, retryDelay))
          return executeWithRetries(retryCount + 1)
        }
        
        this.eventStatus.set(type, EventStatus.FAILED)
        const eventError: EventError = {
          error: error instanceof Error ? error.message : String(error),
          timestamp: Date.now()
        }
        this.emitter.emit('eventFailed', type, eventError)  
        this.errors.set(type, eventError)
        throw error
      }
    }

    await executeWithRetries()
  }

  resetEvent(type: keyof TEventPayloads) {
    this.completedEvents.delete(type)
    this.eventStatus.set(type, EventStatus.PENDING)
    this.errors.delete(type)
  }

  resetEventsAfterTime(time: Date) {
    const eventsToReset = new Set<keyof TEventPayloads>()
    
    for (const [key, value] of this.completedEvents) {
      if (value.at > time) {
        eventsToReset.add(key)
      }
    }

    for (const eventType of eventsToReset) {
      this.resetEvent(eventType)
    }
  }

  getCompletedEvents() {
    return new Map(Array.from(this.completedEvents).map(([k, v]) => [String(k), v]))
  }

  getStatus(type: keyof TEventPayloads): EventStatus | undefined {
    return this.eventStatus.get(type)
  }

  getAllStatuses() {
    return new Map(Array.from(this.eventStatus).map(([k, v]) => [String(k), v]))
  }

  getErrors() {
    return new Map(Array.from(this.errors).map(([k, v]) => [String(k), v]))
  }
} 