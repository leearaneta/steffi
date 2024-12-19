import { EventEmitter } from 'events'
import { EventManager } from './EventManager'
import type {
  Dependencies,
  DependencyGroup,
  DependencyGraphOptions,
  BaseEventPayloads,
  GraphState,
  EventStatus,
  DependencyPredicate,
  OrGroup,
  EventError,
  EventOptions,
} from '@steffi/types'

export class DependencyGraph<TEventPayloads extends BaseEventPayloads> extends EventEmitter {
  private dependencies = {} as Record<keyof TEventPayloads, DependencyGroup<TEventPayloads>[]>
  private dependents = {} as Record<keyof TEventPayloads, Set<keyof TEventPayloads>>
  private eventManager: EventManager<TEventPayloads>
  private predicates = {} as Record<keyof TEventPayloads, DependencyPredicate<TEventPayloads>[]>
  private defaultOptions: DependencyGraphOptions = {}
  private frozenEvents = new Set<keyof TEventPayloads>()
  isActive = false

  constructor(options: DependencyGraphOptions = {}) {
    super()
    this.eventManager = new EventManager(this, options)
    this.defaultOptions = options
  }

  private async tryRunEvent(type: keyof TEventPayloads) {
    if (this.frozenEvents.has(type)) {
      console.log('Cannot run event ', type, ' because its dependencies are being reset.')
      return
    } else if (this.eventManager.getStatus(type) !== 'PENDING') {
      console.log('Cannot run event ', type, ' because is in progress or has already completed.')
      return
    }
    const dependencies = this.dependencies[type] || []
    const passed = this.checkDependenciesAndGetValues(type, dependencies)
    if (passed) {
      passed.predicates.forEach(predicateName => {
        const predicate = this.predicates[type]?.find(p => p.name === predicateName)!
        predicate.passed = true
      })
      await this.eventManager.executeEvent(type, passed.values, passed.predicates)
    }
  }

  registerEvent<
    TDeps extends Extract<keyof TEventPayloads, string>,
    TOptions extends EventOptions<TEventPayloads>
  >(
    type: TDeps,
    dependencies: Dependencies<TEventPayloads>,
    runnable: TOptions extends { fireOnComplete: false }
      ? (args: Pick<TEventPayloads, TDeps>) => Promise<void>
      : (args: Pick<TEventPayloads, TDeps>) => Promise<TEventPayloads[TDeps]>,
    options?: TOptions
  ): void {
    if (this.isActive) {
      throw new Error('Cannot register events after graph has been activated')
    }

    if (this.dependencies[type]) {
      console.warn(`event ${String(type)} is already registered, overwriting dependencies`)
    }

    this.predicates[type] = options?.predicates?.map(predicate => ({ ...predicate, passed: false })) || []

    const decomposed = this.decomposeDependencies(dependencies)
    this.dependencies[type] = decomposed

    decomposed.forEach(group => {
      if (this.wouldCreateCycle(group, type)) {
        throw new Error(`Adding dependencies ${group.join(', ')} to ${String(type)} would create a cycle`)
      }
    })

    const eventOptions = { ...this.defaultOptions, ...options }
    eventOptions.fireOnComplete = eventOptions.fireOnComplete ?? true
    const wrappedRunnable = eventOptions.fireOnComplete
      ? async (args: Pick<TEventPayloads, TDeps>): Promise<void> => {
          const value = await runnable(args)
          await this.completeEvent(type, value!)
        }
      : runnable

    const allDeps = decomposed.flat()
    allDeps.forEach(dependency => {
      if (!this.dependents[dependency]) {
        this.dependents[dependency] = new Set()
      }
      this.dependents[dependency].add(type)
    })

    this.eventManager.registerEvent(type, wrappedRunnable, options)
    this.emit('eventRegistered', type, allDeps, options?.predicates || [])
  }

  async completeEvent(type: keyof TEventPayloads, value?: TEventPayloads[typeof type]) {
    if (!this.isActive) {
      throw new Error('Cannot complete events before graph has been activated')
    }
    await this.eventManager.completeEvent(type, value!, new Date())
    this.emit('eventCompleted', type, value)
    const dependents = this.dependents[type] || new Set()
    for (const dependent of dependents) {
      void this.tryRunEvent(dependent)
    }
  }

  freezeEvent(type: keyof TEventPayloads) {
    this.frozenEvents.add(type)
  }

  unfreezeEvent(type: keyof TEventPayloads) {
    this.frozenEvents.delete(type)
  }

  async resetEvent(
    type: keyof TEventPayloads,
    beforeReset?: (events: (keyof TEventPayloads)[]) => Promise<void>
  ): Promise<void> {
    const dependents = this.getDependentEvents(type)
    const eventsInProgress = [...dependents, type].filter(event =>
      this.eventManager.getStatus(event) === 'IN_PROGRESS'
    )
    dependents.forEach(event => this.freezeEvent(event))
    try {
      // wait for events to complete, and prevent dependents from running
      await Promise.all(eventsInProgress.map(event => this.waitForEvent(event)))
    } catch (e) {
      // ignore errors
    }
    dependents.forEach(event => this.unfreezeEvent(event))
    const eventsToReset = [type, ...dependents].filter(event =>
      this.eventManager.getStatus(event) !== 'PENDING'
    )

    if (beforeReset) {
      await beforeReset(eventsToReset)
    }

    for (const event of eventsToReset) {
      this.eventManager.resetEvent(event)
    }

    void this.tryRunEvent(type)
  }

  async resetEventsAfterTime(time: Date) {
    const resetEvents = this.eventManager.resetEventsAfterTime(time)
    for (const event of resetEvents) {
      void this.tryRunEvent(event)
    }
  }

  getGraph(): GraphState {
    return {
      dependencies: this.dependencies,
      dependents: Object.fromEntries(
        Object.entries(this.dependents).map(([k, v]) => [
          String(k),
          Array.from(v).map(String)
        ])
      ),
      completedEvents: this.eventManager.completedEvents,
      completedTimestamps: this.eventManager.completedTimestamps,
      failedTimestamps: this.eventManager.failedTimestamps,
      status: this.eventManager.eventStatus,
      errors: this.eventManager.errors,
      predicates: this.predicates,
    }
  }

  private getDependentEvents(type: keyof TEventPayloads): Set<keyof TEventPayloads> {
    const getDirectDependents = (eventType: keyof TEventPayloads): Set<keyof TEventPayloads> =>
      this.dependents[eventType] || new Set()
  
    const collectDependents = (
      eventType: keyof TEventPayloads,
      accumulated: Set<keyof TEventPayloads> = new Set()
    ): Set<keyof TEventPayloads> => {
      const directDependents = getDirectDependents(eventType)
      
      return Array.from(directDependents).reduce(
        (acc, dependent) => 
          !acc.has(dependent) 
            ? collectDependents(dependent, acc.add(dependent))
            : acc,
        accumulated
      )
    }
  
    return collectDependents(type)
  }

  activate(initialState?: {
    completed: Partial<{ [K in keyof TEventPayloads]: { at: Date, value: TEventPayloads[K] } }>
    failed: Partial<{ [K in keyof TEventPayloads]: { at: Date, error: EventError } }>
  }): void {
    if (this.isActive) return
    
    this.isActive = true
    
    if (initialState) {
      Object.keys(initialState.completed).forEach(type => {
        const { at, value } = initialState.completed[type]!
        this.eventManager.completeEvent(type, value, at)
      })
      Object.keys(initialState.failed).forEach(type => {
        const { at, error } = initialState.failed[type]!
        this.eventManager.failEvent(type, error, at)
      })
    }

    // TODO: make this more intelligent; we shouldn't need to try to run ALL pending events
    Object.keys(this.dependencies).forEach(type => {
      if (this.getEventStatus(type) === 'PENDING') {
        void this.tryRunEvent(type)
      }
    })
  }

  private wouldCreateCycle(
    newDeps: DependencyGroup<TEventPayloads>,
    targetEvent: keyof TEventPayloads
  ): boolean {
    const getDependencies = (node: keyof TEventPayloads): Set<keyof TEventPayloads> => {
      const nodeDependencies = new Set<keyof TEventPayloads>(
        this.dependencies[node]?.flat() || []
      )
      
      if (node === targetEvent) {
        newDeps.forEach(dep => nodeDependencies.add(dep));
      }
      
      return nodeDependencies;
    };

    for (const startNode of [...newDeps, targetEvent]) {
      const queue: Array<keyof TEventPayloads> = [startNode];
      const visited = new Set<keyof TEventPayloads>();
      
      while (queue.length > 0) {
        const currentNode = queue.shift()!;
        
        if (currentNode === startNode && visited.has(currentNode)) {
          return true;
        }
        
        const dependencies = getDependencies(currentNode);
        
        for (const dep of dependencies) {
          if (!visited.has(dep)) {
            queue.push(dep);
            visited.add(dep);
          } else if (dep === startNode) {
            return true;
          }
        }
      }
    }

    return false;
  }

  getEventStatus(type: keyof TEventPayloads): EventStatus | undefined {
    return this.eventManager.getStatus(type)
  }

  private decomposeDependencies(
    dependencies: Dependencies<TEventPayloads>,
  ): DependencyGroup<TEventPayloads>[] {
    const requiredDeps = dependencies.filter(dep => typeof dep === 'string')

    const orGroups: OrGroup<TEventPayloads>[] = dependencies
      .filter(dep => typeof dep === 'object' && 'or' in dep)
      .map(dep => (dep as OrGroup<TEventPayloads>))

    if (orGroups.length === 0) {
      return [requiredDeps]
    }
    
    const decomposedOrGroups = orGroups
      .map(group => group.or?.flatMap(or => this.decomposeDependencies(or)) || [])

    let results = decomposedOrGroups.shift()!
    while (decomposedOrGroups.length > 0) {
      const group = decomposedOrGroups.shift()!
      results = results.map(result => group.flatMap(g => [...result, ...g]))
    }
    return results.map(result => [...result, ...requiredDeps])
  }

  private checkDependenciesAndGetValues(
    type: keyof TEventPayloads,
    dependencyGroups: DependencyGroup<TEventPayloads>[]
  ): {
    values: Pick<TEventPayloads, Extract<keyof TEventPayloads, string>>,
    predicates: string[]
  } | null {
    if (dependencyGroups.length === 0) {
      return { values: {} as Pick<TEventPayloads, Extract<keyof TEventPayloads, string>>, predicates: [] }
    }

    for (const group of dependencyGroups) {
      const allDepsCompleted = group.every(
        dep => this.eventManager.getStatus(dep) === 'COMPLETED'
      )

      if (allDepsCompleted) {
        const values = group.reduce((acc, dep) => ({
          ...acc,
          [dep]: this.eventManager.getCompletedValue(dep)
        }), {}) as Pick<TEventPayloads, Extract<keyof TEventPayloads, string>>

        const predicates = this.predicates[type]
          .filter(predicate => {
            if (!predicate.required) return true
            return predicate.required.every(dep => this.eventManager.getStatus(dep) === 'COMPLETED')
          })

        const predicatesPass = predicates.every(predicate => !!predicate.fn(values))

        if (predicatesPass) {
          return { values, predicates: predicates.map(predicate => predicate.name) }
        }
      }
    }

    return null
  }

  waitForEvent(type: keyof TEventPayloads): Promise<TEventPayloads[typeof type]> {
    if (this.eventManager.getStatus(type) === 'COMPLETED') {
      return Promise.resolve(this.eventManager.getCompletedValue(type))
    } else if (this.eventManager.getStatus(type) === 'FAILED') {
      return Promise.reject(this.eventManager.getError(type))
    }

    return new Promise((resolve, reject) => {
      const cleanup = () => {
        this.off('eventCompleted', successListener)
        this.off('eventFailed', failureListener)
      }
      const successListener = (eventName: string, value: TEventPayloads[typeof type]) => {
        if (eventName === type) {
          resolve(value)
          cleanup()
        }
      }
      const failureListener = (eventName: string, error: Error) => {
        if (eventName === type) {
          reject(error)
          cleanup()
        }
      }
      this.on('eventCompleted', successListener)
      this.on('eventFailed', failureListener)
    })
  }
} 

