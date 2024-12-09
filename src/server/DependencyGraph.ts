import { EventEmitter } from 'events'
import { EventManager } from './EventManager'
import { Dependencies, DependencyGroup, DependencyGraphOptions, BaseEventPayloads, GraphState, EventStatus } from '../types'

export class DependencyGraph<TEventPayloads extends BaseEventPayloads> extends EventEmitter {
  private dependencies: Map<keyof TEventPayloads, Array<DependencyGroup<TEventPayloads>>> = new Map()
  private dependents: Map<keyof TEventPayloads, Set<keyof TEventPayloads>> = new Map()
  private eventManager: EventManager<TEventPayloads>

  constructor(options: DependencyGraphOptions = {}) {
    super()
    this.eventManager = new EventManager(this, options)
  }

  private async tryRunEvent(type: keyof TEventPayloads) {
    const dependencies = this.dependencies.get(type) || []
    const allDependenciesCompleted = await this.checkDependenciesCompleted(dependencies)

    if (allDependenciesCompleted) {
      const dependencyValues = this.getCompletedDependencyValues(dependencies)
      await this.eventManager.executeEvent(type, dependencyValues)
    }
  }

  registerEvent<TDeps extends keyof TEventPayloads>(
    type: keyof TEventPayloads,
    dependencies: Dependencies<TEventPayloads>,
    runnable: (args: Pick<TEventPayloads, TDeps>) => Promise<any>,
    options: DependencyGraphOptions & { fireOnComplete?: boolean } = {}
  ) {
    const normalizedDeps = this.normalizeDependencies(dependencies)
    
    if (this.wouldCreateCycle(type, normalizedDeps.flat())) {
      throw new Error(`Adding dependencies ${dependencies.join(', ')} to ${String(type)} would create a cycle`)
    }

    const finalOptions = {
      fireOnComplete: true,
      ...options
    }

    const wrappedRunnable = finalOptions.fireOnComplete
      ? async (args: Pick<TEventPayloads, TDeps>) => {
          const value = await runnable(args)
          await this.completeEvent(type, value)
        }
      : runnable

    this.dependencies.set(type, normalizedDeps)
    
    // Update dependents map
    const allDeps = normalizedDeps.flat()
    allDeps.forEach(dependency => {
      if (!this.dependents.has(dependency)) {
        this.dependents.set(dependency, new Set())
      }
      this.dependents.get(dependency)!.add(type)
    })

    this.eventManager.registerEvent(type, wrappedRunnable, finalOptions)
    this.emit('eventRegistered', type, allDeps)

    void this.tryRunEvent(type)
  }

  async completeEvent<T extends keyof TEventPayloads>(type: T, value?: TEventPayloads[T]) {
    await this.eventManager.completeEvent(type, value)
    const dependents = this.dependents.get(type) || new Set()
    for (const dependent of dependents) {
      await this.tryRunEvent(dependent)
    }
  }

  async resetEvent(type: keyof TEventPayloads) {
    const dependents = this.getDependentEvents(type)
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

  deregisterEvent(type: keyof TEventPayloads, options: { 
    cascade?: boolean,
    force?: boolean 
  } = {}) {
    const { cascade = false, force = false } = options
    const hasDependent = this.hasAnyDependents(type)

    if (hasDependent && !force && !cascade) {
      throw new Error(
        `Cannot deregister event "${String(type)}" as it has dependents. ` +
        `Use force: true to deregister anyway, or cascade: true to also remove dependents.`
      )
    }

    if (cascade && hasDependent) {
      // Remove all dependents first
      const dependents = this.getDependentEvents(type)
      for (const dependent of dependents) {
        this.deregisterSingleEvent(dependent)
      }
    }

    this.deregisterSingleEvent(type)
  }

  private deregisterSingleEvent(type: keyof TEventPayloads) {
    this.dependencies.delete(type)
    this.eventManager.deregisterEvent(type)
    
    // Remove this event from all dependency lists
    for (const [_, dependentSet] of this.dependents) {
      dependentSet.delete(type)
    }
    
    this.dependents.delete(type)
  }

  private wouldCreateCycle(
    type: keyof TEventPayloads,
    dependencies: Array<DependencyGroup<TEventPayloads>> | DependencyGroup<TEventPayloads>
  ): boolean {
    const normalizedDeps = this.normalizeDependencies(dependencies)
    
    const visited = new Set<keyof TEventPayloads>()
    const currentPath = new Set<keyof TEventPayloads>()

    const hasCycle = (node: keyof TEventPayloads): boolean => {
      visited.add(node)
      currentPath.add(node)

      const nodeDeps = this.dependencies.get(node)
      if (nodeDeps) {
        const allNodeDeps = nodeDeps.flat()
        
        for (const dep of allNodeDeps) {
          if (!visited.has(dep)) {
            if (hasCycle(dep)) return true
          } else if (currentPath.has(dep)) {
            return true
          }
        }
      }

      currentPath.delete(node)
      return false
    }

    this.dependencies.set(type, normalizedDeps)
    const result = hasCycle(type)
    if (!this.dependencies.has(type)) {
      this.dependencies.delete(type)
    }

    return result
  }

  getEventStatus(type: keyof TEventPayloads): EventStatus | undefined {
    return this.eventManager.getStatus(type)
  }

  private normalizeDependencies(
    dependencies: Dependencies<TEventPayloads>
  ): Array<DependencyGroup<TEventPayloads>> {
    if (dependencies.length === 0) return []
    if (!Array.isArray(dependencies[0])) {
      return [dependencies as DependencyGroup<TEventPayloads>]
    }
    return dependencies as Array<DependencyGroup<TEventPayloads>>
  }

  private async checkDependenciesCompleted(
    dependencyGroups: Array<DependencyGroup<TEventPayloads>>
  ): Promise<boolean> {
    // no dependencies = completed
    if (dependencyGroups.length === 0) return true

    return dependencyGroups.some(group =>
      group.every(dep =>
        this.eventManager.getStatus(dep) === EventStatus.COMPLETED
      )
    )
  }

  private getCompletedDependencyValues<TDeps extends keyof TEventPayloads>(
    dependencyGroups: Array<DependencyGroup<TEventPayloads>>
  ): Pick<TEventPayloads, TDeps> {
    // Find first completed group
    const completedGroup = dependencyGroups.find(group =>
      group.every(dep =>
        this.eventManager.getStatus(dep) === EventStatus.COMPLETED
      )
    )

    if (!completedGroup) {
      return {} as Pick<TEventPayloads, TDeps>
    }

    // Return values from completed group
    return completedGroup.reduce((acc, dep) => ({
      ...acc,
      [dep]: this.eventManager.getCompletedEvents().get(String(dep))?.value
    }), {}) as Pick<TEventPayloads, TDeps>
  }
} 