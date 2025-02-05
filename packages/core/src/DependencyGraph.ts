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
  EventOptions,
} from '@steffi/types'

export class DependencyGraph<TEventPayloads extends BaseEventPayloads> extends EventEmitter {
  private dependencies = {} as Record<keyof TEventPayloads, DependencyGroup<TEventPayloads>[]>
  private dependents = {} as Record<keyof TEventPayloads, Set<keyof TEventPayloads>>
  private eventManager: EventManager<TEventPayloads>
  private predicates = {} as Record<keyof TEventPayloads, DependencyPredicate<TEventPayloads>[]>
  private defaultOptions: DependencyGraphOptions = {}
  private frozenEvents = new Set<keyof TEventPayloads>()
  private allowCycles: boolean
  isActive = false

  constructor(options: DependencyGraphOptions = {}) {
    super()
    this.eventManager = new EventManager(this, options)
    this.defaultOptions = options
    this.allowCycles = options.allowCycles ?? false
    if (options.initialState) {
      Object.entries(options.initialState.completed).forEach(([type, values]) => {
        if (Array.isArray(values)) {
          values.forEach(({ at, value }) => {
            this.eventManager.completeEvent(type, value, at)
          })
        } else {
          const { at, value } = values!
          this.eventManager.completeEvent(type, value, at)
        }
      })
      Object.entries(options.initialState.failed).forEach(([type, values]) => {
        if (Array.isArray(values)) {
          values.forEach(({ at, error }) => {
            this.eventManager.failEvent(type, error, at)
          })
        } else {
          const { at, error } = values!
          this.eventManager.failEvent(type, error, at)
        }
      })
    }
  }

  private async tryRunEvent(type: keyof TEventPayloads) {
    if (this.frozenEvents.has(type)) {
      console.log('Cannot run event ', type, ' because its dependencies are being reset.')
      return
    } else if (
      (!this.allowCycles && this.eventManager.getStatus(type) !== 'PENDING')
      || (this.allowCycles && this.eventManager.getStatus(type) === 'IN_PROGRESS')
    ) {
      console.log('Cannot run event ', type, ' because is in progress or has already completed.')
      return
    }
    const dependencies = this.dependencies[type] || []
    const passed = this.checkDependenciesAndGetValues(type, dependencies)
    if (passed) {
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
      ? (args: Partial<TEventPayloads>) => Promise<void>
      : (args: Partial<TEventPayloads>) => Promise<TEventPayloads[TDeps]>,
    options?: TOptions
  ): void {
    if (this.isActive) {
      throw new Error('Cannot register events after graph has been activated')
    }

    if (this.dependencies[type]) {
      console.warn(`event ${String(type)} is already registered, overwriting dependencies`)
    }
    
    this.predicates[type] = options?.predicates || []

    const decomposed = this.decomposeDependencies(dependencies)
    this.dependencies[type] = decomposed

    if (!this.allowCycles) {
      decomposed.forEach(group => {
        if (this.wouldCreateCycle(group, type)) {
          throw new Error(`Adding dependencies ${group.join(', ')} to ${String(type)} would create a cycle`)
        }
      })
    }

    const eventOptions = { ...this.defaultOptions, ...options }
    eventOptions.fireOnComplete = eventOptions.fireOnComplete ?? true
    const wrappedRunnable = eventOptions.fireOnComplete
      ? async (args: Partial<TEventPayloads>): Promise<void> => {
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
    const now = new Date()
    await this.eventManager.completeEvent(type, value!, now)
    this.emit('eventCompleted', type, value, now)
    const dependents = this.dependents[type] || new Set()
    for (const dependent of dependents) {
      void this.tryRunEvent(dependent)
    }
  }

  freezeEvent(type: keyof TEventPayloads) {
    this.frozenEvents.add(type)
  }

  freeze() {
    Object.keys(this.dependencies).forEach(type => this.freezeEvent(type))
  }

  unfreezeEvent(type: keyof TEventPayloads) {
    this.frozenEvents.delete(type)
  }

  unfreeze() {
    Object.keys(this.dependencies).forEach(type => this.unfreezeEvent(type))
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
    const eventsToReset = this.allowCycles
      ? [type]
      : [type, ...dependents].filter(event =>
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


  getGraph(): GraphState {
    return {
      allowCycles: this.allowCycles,
      dependencies: this.dependencies,
      dependents: Object.fromEntries(
        Object.entries(this.dependents).map(([k, v]) => [
          String(k),
          Array.from(v).map(String)
        ])
      ),
      initiatedEvents: this.eventManager.initiatedEvents,
      completedEvents: this.eventManager.completedEvents,
      failedEvents: this.eventManager.failedEvents,
      status: this.eventManager.eventStatus,
      predicates: this.predicates,
    }
  }

  private getDependentEvents(type: keyof TEventPayloads): Set<keyof TEventPayloads> {
    const getDirectDependents = (eventType: keyof TEventPayloads): Set<keyof TEventPayloads> =>
      this.dependents[eventType] || new Set()
  
    const collectDependents = (
      eventType: keyof TEventPayloads,
      _accumulated: Set<keyof TEventPayloads> = new Set()
    ): Set<keyof TEventPayloads> => {
      if (_accumulated.has(eventType)) {
        return _accumulated
      }
      const accumulated = _accumulated.add(eventType)
      const directDependents = getDirectDependents(eventType)
      
      return Array.from(directDependents).reduce(
        (acc, dependent) => 
          !acc.has(dependent) 
            ? collectDependents(dependent, accumulated)
            : acc,
        accumulated
      )
    }
  
    return collectDependents(type)
  }

  activate(): void {
    if (this.isActive) return
    
    this.isActive = true
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
    values: Partial<TEventPayloads>,
    predicates: string[]
  } | null {
    if (dependencyGroups.length === 0) {
      return { values: {} as Partial<TEventPayloads>, predicates: [] }
    }

    for (const group of dependencyGroups) {
      const allDepsCompleted = group.every(
        dep => this.eventManager.getStatus(dep) === 'COMPLETED'
      )

      if (allDepsCompleted) {
        const values = [...new Set(this.dependencies[type].flat())].reduce((acc, dep) => {
          const completedValues = this.eventManager.getCompletedValue(dep)
          const value = completedValues
            ? completedValues[completedValues.length - 1]?.value
            : undefined 
          return { ...acc, [dep]: value }
        }, {}) as Partial<TEventPayloads>

        const predicates = this.predicates[type]
          .filter(predicate => {
            if (!predicate.required) return true
            return predicate.required.every(dep => this.eventManager.getStatus(dep) === 'COMPLETED')
          })

        const predicatesPass = predicates.every(predicate => !!predicate.fn(values, this.getGraph()))

        if (predicatesPass) {
          return { values, predicates: predicates.map(predicate => predicate.name) }
        }
      }
    }

    return null
  }

  waitForEvent(type: keyof TEventPayloads): Promise<{ at: Date, value: TEventPayloads[typeof type] }[]> {
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

