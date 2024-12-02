import { EventEmitter } from 'events'
import { EventManager } from './EventManager'
import { DependencyGraphOptions, BaseEventPayloads, GraphState, EventStatus } from '../types'

export class DependencyGraph<TEventPayloads extends BaseEventPayloads> extends EventEmitter {
  private dependencies: Map<keyof TEventPayloads, Set<keyof TEventPayloads>> = new Map()
  private dependents: Map<keyof TEventPayloads, Set<keyof TEventPayloads>> = new Map()
  private eventManager: EventManager<TEventPayloads>

  constructor(options: DependencyGraphOptions = {}) {
    super()
    this.eventManager = new EventManager(this, options)
  }

  private async tryRunEvent(type: keyof TEventPayloads) {
    const dependencies = this.dependencies.get(type) || new Set()
    const allDependenciesCompleted = dependencies.size === 0 || 
      Array.from(dependencies).every(dep => 
        this.eventManager.getStatus(dep) === EventStatus.COMPLETED
      )

    if (allDependenciesCompleted) {
      const deps = Array.from(dependencies) as Array<keyof TEventPayloads>
      const dependencyValues = deps.reduce((acc, dep) => ({
        ...acc,
        [dep]: this.eventManager.getCompletedEvents().get(String(dep))?.value
      }), {}) as Pick<TEventPayloads, typeof deps[number]>
      
      await this.eventManager.executeEvent(type, dependencyValues)
    }
  }

  registerEvent<TDeps extends keyof TEventPayloads>(
    type: keyof TEventPayloads,
    dependencies: TDeps[],
    runnable: (args: Pick<TEventPayloads, TDeps>) => Promise<any>,
    options: DependencyGraphOptions & { fireOnComplete?: boolean } = {}
  ) {
    if (this.wouldCreateCycle(type, dependencies)) {
      throw new Error(`Adding dependencies ${dependencies.join(', ')} to ${String(type)} would create a cycle`)
    }

    const finalOptions = {
      fireOnComplete: true,
      ...options
    }

    // wrap the runnable to automatically fire onComplete when event is completed
    const wrappedRunnable = finalOptions.fireOnComplete
      ? async (args: Pick<TEventPayloads, TDeps>) => {
          const value = await runnable(args)
          await this.completeEvent(type, value)
        }
      : runnable

    this.dependencies.set(type, new Set(dependencies))
    dependencies.forEach(dependency => {
      if (!this.dependents.has(dependency)) {
        this.dependents.set(dependency, new Set())
      }
      this.dependents.get(dependency)!.add(type)
    })

    this.eventManager.registerEvent(type, wrappedRunnable, finalOptions)
    this.emit('eventRegistered', type, dependencies)

    void this.tryRunEvent(type)
  }

  async completeEvent<T extends keyof TEventPayloads>(type: T, value?: TEventPayloads[T]) {
    await this.eventManager.completeEvent(type, value)
    
    const dependents = this.dependents.get(type) || new Set()
    
    // for each dependent, check if it can be run
    for (const dependent of dependents) {
      await this.tryRunEvent(dependent)
    }
  }

  async resetEvent(type: keyof TEventPayloads) {
    const dependents = this.getDependentEvents(type)
    
    // Reset the event itself and all its dependents
    this.eventManager.resetEvent(type)
    for (const dependent of dependents) {
      this.eventManager.resetEvent(dependent)
    }

    await this.tryRunEvent(type)
  }

  async resetEventsAfterTime(time: Date) {
    const resetEvents = this.eventManager.resetEventsAfterTime(time)
    
    // Try to rerun each reset event
    for (const event of resetEvents) {
      await this.tryRunEvent(event)
    }
  }

  getGraph(): GraphState {
    return {
      dependencies: Object.fromEntries(
        Array.from(this.dependencies).map(([k, v]) => [
          String(k),
          Array.from(v).map(String)
        ])
      ),
      dependents: Object.fromEntries(
        Array.from(this.dependents).map(([k, v]) => [
          String(k),
          Array.from(v).map(String)
        ])
      ),
      completedEvents: Object.fromEntries(
        Array.from(this.eventManager.getCompletedEvents())
      ),
      status: Object.fromEntries(
        Array.from(this.eventManager.getAllStatuses())
      ),
      errors: Object.fromEntries(
        Array.from(this.eventManager.getErrors())
      )
    }
  }

  private getDependentEvents(type: keyof TEventPayloads): Set<keyof TEventPayloads> {
    const allDependents = new Set<keyof TEventPayloads>()
    
    const collectDependents = (eventType: keyof TEventPayloads) => {
      const directDependents = this.dependents.get(eventType)
      if (directDependents) {
        for (const dependent of directDependents) {
          if (!allDependents.has(dependent)) {
            allDependents.add(dependent)
            collectDependents(dependent)
          }
        }
      }
    }

    collectDependents(type)
    return allDependents
  }

  private hasAnyDependents(type: keyof TEventPayloads): boolean {
    return (this.dependents.get(type)?.size ?? 0) > 0
  }

  unsafelyDeregisterEvent(type: keyof TEventPayloads) {
    const dependents = this.getDependentEvents(type)
    const eventsToRemove = new Set([type, ...dependents])
    
    for (const eventToRemove of eventsToRemove) {
      this.dependencies.delete(eventToRemove)
      this.eventManager.deregisterEvent(eventToRemove)
      
      for (const [_, dependentSet] of this.dependents) {
        dependentSet.delete(eventToRemove)
      }
    }
    
    this.dependents.delete(type)
    for (const dependent of dependents) {
      this.dependents.delete(dependent)
    }
  }

  trySafelyDeregisterEvent(type: keyof TEventPayloads): boolean {
    if (!this.hasAnyDependents(type)) {
      this.dependencies.delete(type)
      this.eventManager.deregisterEvent(type)
      
      for (const [_, dependentSet] of this.dependents) {
        dependentSet.delete(type)
      }
      
      this.dependents.delete(type)
      return true
    }
    return false
  }

  private wouldCreateCycle(
    newEvent: keyof TEventPayloads,
    dependencies: Array<keyof TEventPayloads>
  ): boolean {
    const visited = new Set<keyof TEventPayloads>()
    const visiting = new Set<keyof TEventPayloads>()

    const visit = (event: keyof TEventPayloads): boolean => {
      if (visiting.has(event)) return true
      if (visited.has(event)) return false

      visiting.add(event)
      const deps = event === newEvent ? dependencies : this.dependencies.get(event)
      if (deps) {
        for (const dep of deps) {
          if (visit(dep)) return true
        }
      }
      visiting.delete(event)
      visited.add(event)
      return false
    }

    return visit(newEvent)
  }

  getEventStatus(type: keyof TEventPayloads): EventStatus | undefined {
    return this.eventManager.getStatus(type)
  }
} 