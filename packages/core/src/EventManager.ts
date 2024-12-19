import { EventEmitter } from 'events'
import type { BaseEventPayloads, DependencyGraphOptions, EventStatus, EventError, DependencyPredicate } from '@steffi/types'

export class EventManager<TEventPayloads extends BaseEventPayloads> {
  private runnables = {} as Record<
    keyof TEventPayloads, 
    (args: Pick<TEventPayloads, Extract<keyof TEventPayloads, string>>) => Promise<void>
  >
  completedEvents = {} as {[K in keyof TEventPayloads]: TEventPayloads[K]}
  completedTimestamps = {} as Record<keyof TEventPayloads, number>
  eventOptions = {} as Record<keyof TEventPayloads, Required<DependencyGraphOptions>>
  eventStatus = {} as Record<keyof TEventPayloads, EventStatus>
  errors = {} as Record<keyof TEventPayloads, EventError>
  failedTimestamps = {} as Record<keyof TEventPayloads, number>
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
    runnable: (args: Pick<TEventPayloads, Extract<keyof TEventPayloads, string>>) => Promise<void>,
    options: DependencyGraphOptions = {}
  ) {
    const mergedOptions = {
      ...this.defaultOptions,
      ...options
    }
    
    this.eventOptions[type] = mergedOptions
    this.runnables[type] = runnable
    this.eventStatus[type] = 'PENDING'
  }

  deregisterEvent(type: keyof TEventPayloads) {
    delete this.runnables[type]
    delete this.completedEvents[type]
    delete this.completedTimestamps[type]
    delete this.eventOptions[type]
    delete this.eventStatus[type]
    delete this.errors[type]
  }

  async completeEvent(
    type: keyof TEventPayloads, 
    value: TEventPayloads[typeof type], 
    at: Date
  ): Promise<void> {
    if (['FAILED', 'COMPLETED'].includes(this.eventStatus[type])) {
      console.warn(
        'event already',
        this.eventStatus[type] === 'FAILED' ? 'failed' : 'completed',
        type
      )
      return
    }
    this.completedEvents[type] = value
    this.completedTimestamps[type] = at ? at.getTime() : Date.now()
    this.eventStatus[type] = 'COMPLETED'
  }

  async executeEvent(
    type: keyof TEventPayloads, 
    eventArgs: Pick<TEventPayloads, Extract<keyof TEventPayloads, string>>,
    predicates: string[] = []
  ) {
    const options = this.eventOptions[type] ?? this.defaultOptions
    const { maxRetries, retryDelay, timeout } = options

    const executeWithRetries = async (retryCount = 0): Promise<void> => {
      try {
        this.eventStatus[type] = 'IN_PROGRESS'
        this.emitter.emit('eventStarted', type, predicates)
        
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
          this.eventStatus[type] = 'PENDING'
          await new Promise(resolve => setTimeout(resolve, retryDelay))
          return executeWithRetries(retryCount + 1)
        }
        const eventError: EventError = error instanceof Error ? error.message : String(error)
        const now = new Date()
        this.failEvent(type, eventError, now)
        this.emitter.emit('eventFailed', type, eventError, now)
        console.error('event failed', type, eventError)
      }
    }

    await executeWithRetries()
  }

  failEvent(type: keyof TEventPayloads, error: EventError, at: Date) {
    if (['FAILED', 'COMPLETED'].includes(this.eventStatus[type])) {
      console.warn(
        'event already',
        this.eventStatus[type] === 'FAILED' ? 'failed' : 'completed',
        type
      )
      return
    }
    this.failedTimestamps[type] = at.getTime()
    this.eventStatus[type] = 'FAILED'
    this.errors[type] = error
  }

  resetEvent(type: keyof TEventPayloads) {
    delete this.completedEvents[type]
    delete this.completedTimestamps[type]
    this.eventStatus[type] = 'PENDING'
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

  getStatus(type: keyof TEventPayloads): EventStatus | undefined {
    return this.eventStatus[type]
  }

  getCompletedValue(type: keyof TEventPayloads) {
    return this.completedEvents[type]
  }

  getError(type: keyof TEventPayloads) {
    return this.errors[type]
  }
} 