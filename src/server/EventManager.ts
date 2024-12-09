import { EventEmitter } from 'events'
import { BaseEventPayloads, DependencyGraphOptions, EventStatus, EventError } from '../types'

export class EventManager<TEventPayloads extends BaseEventPayloads> {
  private runnables = {} as Record<keyof TEventPayloads, (args: Pick<TEventPayloads, keyof TEventPayloads>) => Promise<void>>
  private completedEvents = {} as {[K in keyof TEventPayloads]: TEventPayloads[K]}
  private completedTimestamps = {} as Record<keyof TEventPayloads, number>
  private eventOptions = {} as Record<keyof TEventPayloads, Required<DependencyGraphOptions>>
  private eventStatus = {} as Record<keyof TEventPayloads, EventStatus>
  private errors = {} as Record<keyof TEventPayloads, EventError>
  private readonly defaultOptions: Required<DependencyGraphOptions>

  constructor(
    private emitter: EventEmitter,
    options: DependencyGraphOptions = {}
  ) {
    this.defaultOptions = {
      maxRetries: options.maxRetries ?? 1,
      retryDelay: options.retryDelay ?? 1000,
      timeout: options.timeout ?? 1000000,
      fireOnComplete: options.fireOnComplete ?? true
    }
  }

  registerEvent(
    type: keyof TEventPayloads,
    runnable: (args: Pick<TEventPayloads, keyof TEventPayloads>) => Promise<void>,
    options: DependencyGraphOptions = {}
  ) {
    const mergedOptions = {
      ...this.defaultOptions,
      ...options
    }
    
    this.eventOptions[type] = mergedOptions
    this.runnables[type] = runnable
    this.eventStatus[type] = EventStatus.PENDING
  }

  deregisterEvent(type: keyof TEventPayloads) {
    delete this.runnables[type]
    delete this.completedEvents[type]
    delete this.completedTimestamps[type]
    delete this.eventOptions[type]
    delete this.eventStatus[type]
    delete this.errors[type]
  }

  async completeEvent(type: keyof TEventPayloads, value?: TEventPayloads[typeof type]) {
    this.completedEvents[type] = value
    this.completedTimestamps[type] = Date.now()
    this.eventStatus[type] = EventStatus.COMPLETED
    this.emitter.emit('eventCompleted', type, value)
    delete this.errors[type]
  }

  async executeEvent(type: keyof TEventPayloads, eventArgs: Pick<TEventPayloads, keyof TEventPayloads>) {
    const currentStatus = this.eventStatus[type]
    if (currentStatus === EventStatus.COMPLETED || currentStatus === EventStatus.IN_PROGRESS) {
      return
    }

    const options = this.eventOptions[type] ?? this.defaultOptions
    const { maxRetries, retryDelay, timeout } = options

    const executeWithRetries = async (retryCount = 0): Promise<void> => {
      try {
        this.eventStatus[type] = EventStatus.IN_PROGRESS
        this.emitter.emit('eventStarted', type)
        
        const timeoutPromise = new Promise<void>((_, reject) => {
          setTimeout(() => reject(new Error(`Event ${String(type)} timed out after ${timeout}ms`)), timeout)
        })

        const runnable = this.runnables[type]
        if (runnable) {
          await Promise.race([
            runnable(eventArgs),
            timeoutPromise
          ])
        }

      } catch (error) {
        if (retryCount < maxRetries) {
          this.eventStatus[type] = EventStatus.PENDING
          await new Promise(resolve => setTimeout(resolve, retryDelay))
          return executeWithRetries(retryCount + 1)
        }
        
        this.eventStatus[type] = EventStatus.FAILED
        const eventError: EventError = {
          error: error instanceof Error ? error.message : String(error),
          timestamp: Date.now()
        }
        this.emitter.emit('eventFailed', type, eventError)  
        this.errors[type] = eventError
        throw error
      }
    }

    await executeWithRetries()
  }

  resetEvent(type: keyof TEventPayloads) {
    delete this.completedEvents[type]
    delete this.completedTimestamps[type]
    this.eventStatus[type] = EventStatus.PENDING
    delete this.errors[type]
  }

  resetEventsAfterTime(time: Date): Set<keyof TEventPayloads> {
    const eventsToReset = new Set<keyof TEventPayloads>()
    
    for (const [key, timestamp] of Object.entries(this.completedTimestamps)) {
      if (timestamp > time.getTime()) {
        eventsToReset.add(key as keyof TEventPayloads)
      }
    }

    for (const eventType of eventsToReset) {
      this.resetEvent(eventType)
    }

    return eventsToReset
  }

  getCompletedEvents() {
    return this.completedEvents
  }

  getCompletedTimestamps() {
    return this.completedTimestamps
  }

  getStatus(type: keyof TEventPayloads): EventStatus | undefined {
    return this.eventStatus[type]
  }

  getAllStatuses() {
    return this.eventStatus
  }

  getErrors() {
    return this.errors
  }

  getCompletedValue(type: keyof TEventPayloads) {
    return this.completedEvents[type]
  }
} 