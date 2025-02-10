import { EventEmitter } from 'events'
import type { BaseEventPayloads, EventStatus, EventError, EventOptions } from './types'

export class EventManager<TEventPayloads extends BaseEventPayloads> {
  private runnables = {} as Record<
    keyof TEventPayloads, 
    (args: Partial<TEventPayloads>) => Promise<void>
  >
  initiatedEvents = {} as {[K in keyof TEventPayloads]: { at: Date, predicates: string[] }[]}
  completedEvents = {} as {[K in keyof TEventPayloads]: { at: Date, value: TEventPayloads[K] }[]}
  failedEvents = {} as Record<keyof TEventPayloads, { at: Date, error: EventError }[]>
  eventOptions = {} as Record<keyof TEventPayloads, EventOptions<TEventPayloads>>
  eventStatus = {} as Record<keyof TEventPayloads, EventStatus>
  private readonly defaultOptions: Required<Omit<EventOptions<TEventPayloads>, 'predicates'>>

  constructor(
    private emitter: EventEmitter,
    options: EventOptions<TEventPayloads> = {}
  ) {
    this.defaultOptions = {
      maxRetries: options.maxRetries ?? 1,
      retryDelay: options.retryDelay ?? 1000,
      timeout: options.timeout ?? 1000000,
      fireOnComplete: options.fireOnComplete ?? true,
      maxRuns: options.maxRuns ?? 5,
    }
  }

  registerEvent(
    type: keyof TEventPayloads,
    runnable: (args: Partial<TEventPayloads>) => Promise<void>,
    options: EventOptions<TEventPayloads> = {}
  ) {
    console.log('registering event', type, options)
    const mergedOptions = {
      ...this.defaultOptions,
      ...options
    }
    this.eventOptions[type] = mergedOptions
    this.runnables[type] = runnable
    if (!this.eventStatus[type]) {
      this.eventStatus[type] = 'PENDING'
    }
    if (!this.completedEvents[type]) {
      this.completedEvents[type] = []
    }
    if (!this.failedEvents[type]) {
      this.failedEvents[type] = []
    } 
    if (!this.initiatedEvents[type]) {
      this.initiatedEvents[type] = []
    }
  }

  deregisterEvent(type: keyof TEventPayloads) {
    delete this.runnables[type]
    delete this.completedEvents[type]
    delete this.failedEvents[type]
    delete this.initiatedEvents[type]
    delete this.eventOptions[type]
    delete this.eventStatus[type]
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
    if (!this.completedEvents[type]) {
      this.completedEvents[type] = []
    }
    this.completedEvents[type].push({ at, value })
    this.eventStatus[type] = 'COMPLETED'
  }

  async executeEvent(
    type: keyof TEventPayloads, 
    eventArgs: Partial<TEventPayloads>,
    predicates: string[] = []
  ) {
    const now = new Date()
    this.eventStatus[type] = 'IN_PROGRESS'
    if (!this.initiatedEvents[type]) {
      this.initiatedEvents[type] = []
    }
    this.initiatedEvents[type].push({ at: now, predicates })
    this.emitter.emit('eventStarted', type, predicates, now)

    const options = { ...this.defaultOptions, ...this.eventOptions[type] }
    const { maxRetries, retryDelay, timeout, maxRuns } = options
    const totalRuns = [...(this.completedEvents[type] || []), ...(this.failedEvents[type] || [])].length
    if (totalRuns >= maxRuns) {
      this.failEvent(type, 'max runs reached', new Date())
      return
    }

    const executeWithRetries = async (retryCount = 0): Promise<void> => {
      try {
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
    if (!this.failedEvents[type]) {
      this.failedEvents[type] = []
    }
    this.failedEvents[type].push({ at, error })
    this.eventStatus[type] = 'FAILED'
  }

  resetEvent(type: keyof TEventPayloads) {
    this.eventStatus[type] = 'PENDING'
  }

  getStatus(type: keyof TEventPayloads): EventStatus | undefined {
    return this.eventStatus[type]
  }

  getCompletedValue(type: keyof TEventPayloads) {
    return this.completedEvents[type]
  }

  getError(type: keyof TEventPayloads) {
    return this.failedEvents[type]
  }
} 