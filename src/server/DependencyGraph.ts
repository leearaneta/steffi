import { EventEmitter } from 'events'
import { EventManager } from './EventManager'
import { Dependencies, DependencyGroup, DependencyGraphOptions, BaseEventPayloads, GraphState, EventStatus, DependencyPredicate, OrGroup, EventOptions } from '../types'

export class DependencyGraph<TEventPayloads extends BaseEventPayloads> extends EventEmitter {
  private dependencies = {} as Record<keyof TEventPayloads, DependencyGroup<TEventPayloads>[]>
  private dependents = {} as Record<keyof TEventPayloads, Set<keyof TEventPayloads>>
  private eventManager: EventManager<TEventPayloads>
  private predicates = {} as Record<keyof TEventPayloads, DependencyPredicate<TEventPayloads>[]>

  constructor(options: DependencyGraphOptions = {}) {
    super()
    this.eventManager = new EventManager(this, options)
  }

  private async tryRunEvent(type: keyof TEventPayloads) {
    const dependencies = this.dependencies[type] || []
    const values = this.checkDependenciesAndGetValues(type, dependencies)
    if (values) {
      await this.eventManager.executeEvent(type, values)
    }
  }

  // these overloads keep the runnable typesafe depending on fireOnComplete
  registerEvent<TDeps extends keyof TEventPayloads>(
    type: keyof TEventPayloads,
    dependencies: Dependencies<TEventPayloads>,
    runnable: (args: Pick<TEventPayloads, TDeps>) => Promise<void>,
    options?: EventOptions<TEventPayloads> & { fireOnComplete?: true }
  ): void;

  registerEvent<TDeps extends keyof TEventPayloads>(
    type: keyof TEventPayloads,
    dependencies: Dependencies<TEventPayloads>,
    runnable: (args: Pick<TEventPayloads, TDeps>) => Promise<TEventPayloads[typeof type]>,
    options: EventOptions<TEventPayloads> & { fireOnComplete: false }
  ): void;

  registerEvent<TDeps extends keyof TEventPayloads>(
    type: keyof TEventPayloads,
    dependencies: Dependencies<TEventPayloads>,
    runnable: (args: Pick<TEventPayloads, TDeps>) => Promise<TEventPayloads[typeof type]>,
    options: EventOptions<TEventPayloads> = {}
  ) {
    this.predicates[type] = options.predicates || []

    const decomposed = this.decomposeDependencies(dependencies)
    this.dependencies[type] = decomposed

    decomposed.forEach(group => {
      if (this.wouldCreateCycle(group, type)) {
        throw new Error(`Adding dependencies ${group.join(', ')} to ${String(type)} would create a cycle`)
      }
    })

    options.fireOnComplete = options.fireOnComplete ?? true
    const wrappedRunnable = options.fireOnComplete
      ? async (args: Pick<TEventPayloads, TDeps>) => {
          const value = await runnable(args)
          await this.completeEvent(type, value)
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

  deregisterEvent(type: keyof TEventPayloads, options: { cascade?: boolean, force?: boolean } = {}) {
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
    
    for (const dependentSet of Object.values(this.dependents)) {
      dependentSet.delete(type)
    }
    
    delete this.dependents[type]
  }

  private wouldCreateCycle(
    newDeps: DependencyGroup<TEventPayloads>,
    targetEvent: keyof TEventPayloads
  ): boolean {
    const getDependencies = (node: keyof TEventPayloads): Set<keyof TEventPayloads> => {
      const nodeDependencies = new Set<keyof TEventPayloads>();
      const existingDeps = this.dependencies[node] || [];
      existingDeps.forEach(group => {
        group.forEach(dep => nodeDependencies.add(dep));
      });
      
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
      .map(group => group.or.flatMap(or => this.decomposeDependencies(or)))

    let results = decomposedOrGroups.shift()
    while (decomposedOrGroups.length > 0) {
      const group = decomposedOrGroups.shift()
      results = results.map(result => group.flatMap(g => [...result, ...g]))
    }
    return results.map(result => [...result, ...requiredDeps])
  }

  private checkDependenciesAndGetValues(
    type: keyof TEventPayloads,
    dependencyGroups: DependencyGroup<TEventPayloads>[]
  ): Pick<TEventPayloads, Extract<keyof TEventPayloads, string>> | null {
    if (dependencyGroups.length === 0) {
      return {} as Pick<TEventPayloads, Extract<keyof TEventPayloads, string>>
    }

    for (const group of dependencyGroups) {
      const allDepsCompleted = group.every(
        dep => this.eventManager.getStatus(dep) === EventStatus.COMPLETED
      )

      if (allDepsCompleted) {
        const values = group.reduce((acc, dep) => ({
          ...acc,
          [dep]: this.eventManager.getCompletedEvents()[dep]
        }), {}) as Pick<TEventPayloads, Extract<keyof TEventPayloads, string>>

        const predicatesPass = this.predicates[type]
          .filter(predicate => {
            if (!predicate.required) return true
            return predicate.required.every(dep => this.eventManager.getStatus(dep) === EventStatus.COMPLETED)
          })
          .every(predicate => !!predicate.fn(values))

        if (predicatesPass) {
          return values
        }
      }
    }

    return null
  }
} 