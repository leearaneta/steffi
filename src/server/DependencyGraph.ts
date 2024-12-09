import { EventEmitter } from 'events'
import { EventManager } from './EventManager'
import { Dependencies, DependencyGroup, DependencyGraphOptions, BaseEventPayloads, GraphState, EventStatus } from '../types'

export class DependencyGraph<TEventPayloads extends BaseEventPayloads> extends EventEmitter {
  private dependencies: Record<keyof TEventPayloads, Array<DependencyGroup<TEventPayloads>>> = {} as Record<keyof TEventPayloads, Array<DependencyGroup<TEventPayloads>>>
  private dependents: Record<keyof TEventPayloads, Set<keyof TEventPayloads>> = {} as Record<keyof TEventPayloads, Set<keyof TEventPayloads>>
  private eventManager: EventManager<TEventPayloads>

  constructor(options: DependencyGraphOptions = {}) {
    super()
    this.eventManager = new EventManager(this, options)
  }

  private async tryRunEvent(type: keyof TEventPayloads) {
    const dependencies = this.dependencies[type] || []
    const allDependenciesCompleted = await this.checkDependenciesCompleted(dependencies)

    if (allDependenciesCompleted) {
      const dependencyValues = this.getCompletedDependencyValues(dependencies)
      await this.eventManager.executeEvent(type, dependencyValues)
    }
  }

  registerEvent<TDeps extends keyof TEventPayloads>(
    type: keyof TEventPayloads,
    dependencies: Dependencies<TEventPayloads>,
    runnable: (args: Pick<TEventPayloads, TDeps>) => Promise<void>,
    options?: DependencyGraphOptions & { fireOnComplete?: true }
  ): void;

  registerEvent<TDeps extends keyof TEventPayloads>(
    type: keyof TEventPayloads,
    dependencies: Dependencies<TEventPayloads>,
    runnable: (args: Pick<TEventPayloads, TDeps>) => Promise<TEventPayloads[typeof type]>,
    options: DependencyGraphOptions & { fireOnComplete: false }
  ): void;

  registerEvent<TDeps extends keyof TEventPayloads>(
    type: keyof TEventPayloads,
    dependencies: Dependencies<TEventPayloads>,
    runnable: (args: Pick<TEventPayloads, TDeps>) => Promise<TEventPayloads[typeof type]>,
    options: DependencyGraphOptions = {}
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

    this.dependencies[type] = normalizedDeps
    
    // Update dependents map
    const allDeps = normalizedDeps.flat()
    allDeps.forEach(dependency => {
      if (!this.dependents[dependency]) {
        this.dependents[dependency] = new Set()
      }
      this.dependents[dependency].add(type)
    })

    this.eventManager.registerEvent(type, wrappedRunnable, finalOptions)
    this.emit('eventRegistered', type, allDeps)

    void this.tryRunEvent(type)
  }

  async completeEvent(type: keyof TEventPayloads, value?: TEventPayloads[typeof type]) {
    await this.eventManager.completeEvent(type, value)
    const dependents = this.dependents[type] || new Set()
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
        Object.entries(this.dependencies).map(([k, v]) => [
          String(k),
          Array.from(v).map(String)
        ])
      ),
      dependents: Object.fromEntries(
        Object.entries(this.dependents).map(([k, v]) => [
          String(k),
          Array.from(v).map(String)
        ])
      ),
      completedEvents: this.eventManager.getCompletedEvents(),
      completedTimestamps: this.eventManager.getCompletedTimestamps(),
      status: this.eventManager.getAllStatuses(),
      errors: this.eventManager.getErrors(),
    }
  }

  private getDependentEvents(type: keyof TEventPayloads): Set<keyof TEventPayloads> {
    const allDependents = new Set<keyof TEventPayloads>()
    
    const collectDependents = (eventType: keyof TEventPayloads) => {
      const directDependents = this.dependents[eventType]
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
    return (this.dependents[type]?.size ?? 0) > 0
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
      const dependents = this.getDependentEvents(type)
      for (const dependent of dependents) {
        this.deregisterSingleEvent(dependent)
      }
    }

    this.deregisterSingleEvent(type)
  }

  private deregisterSingleEvent(type: keyof TEventPayloads) {
    delete this.dependencies[type]
    this.eventManager.deregisterEvent(type)
    
    // Remove this event from all dependency lists
    for (const dependentSet of Object.values(this.dependents)) {
      dependentSet.delete(type)
    }
    
    delete this.dependents[type]
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

      const nodeDeps = this.dependencies[node]
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

    this.dependencies[type] = normalizedDeps
    const result = hasCycle(type)
    if (!this.dependencies[type]) {
      delete this.dependencies[type]
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
      [dep]: this.eventManager.getCompletedEvents()[dep]
    }), {}) as Pick<TEventPayloads, TDeps>
  }
} 