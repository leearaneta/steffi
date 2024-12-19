import { EventEmitter } from 'events';
import { EventManager } from './EventManager';
import { EventStatus, } from '@types';
export class DependencyGraph extends EventEmitter {
    constructor(options = {}) {
        super();
        this.dependencies = {};
        this.dependents = {};
        this.predicates = {};
        this.defaultOptions = {};
        this.frozenEvents = new Set();
        this.isActive = false;
        this.eventManager = new EventManager(this, options);
        this.defaultOptions = options;
    }
    async tryRunEvent(type) {
        if (this.frozenEvents.has(type)) {
            console.log('Cannot run event ', type, ' because its dependencies are being reset.');
            return;
        }
        else if (this.eventManager.getStatus(type) !== EventStatus.PENDING) {
            console.log('Cannot run event ', type, ' because is in progress or has already completed.');
            return;
        }
        const dependencies = this.dependencies[type] || [];
        const values = this.checkDependenciesAndGetValues(type, dependencies);
        if (values) {
            await this.eventManager.executeEvent(type, values);
        }
    }
    registerEvent(type, dependencies, runnable, options = {}) {
        if (this.isActive) {
            throw new Error('Cannot register events after graph has been activated');
        }
        if (this.dependencies[type]) {
            console.warn(`event ${String(type)} is already registered, overwriting dependencies`);
        }
        this.predicates[type] = options.predicates || [];
        const decomposed = this.decomposeDependencies(dependencies);
        this.dependencies[type] = decomposed;
        decomposed.forEach(group => {
            if (this.wouldCreateCycle(group, type)) {
                throw new Error(`Adding dependencies ${group.join(', ')} to ${String(type)} would create a cycle`);
            }
        });
        const eventOptions = { ...this.defaultOptions, ...options };
        eventOptions.fireOnComplete = eventOptions.fireOnComplete ?? true;
        const wrappedRunnable = eventOptions.fireOnComplete
            ? async (args) => {
                const value = await runnable(args);
                await this.completeEvent(type, value);
            }
            : runnable;
        const allDeps = decomposed.flat();
        allDeps.forEach(dependency => {
            if (!this.dependents[dependency]) {
                this.dependents[dependency] = new Set();
            }
            this.dependents[dependency].add(type);
        });
        this.eventManager.registerEvent(type, wrappedRunnable, options);
        this.emit('eventRegistered', type, allDeps);
    }
    async completeEvent(type, value) {
        if (!this.isActive) {
            throw new Error('Cannot complete events before graph has been activated');
        }
        await this.eventManager.completeEvent(type, value, new Date());
        this.emit('eventCompleted', type, value);
        const dependents = this.dependents[type] || new Set();
        for (const dependent of dependents) {
            void this.tryRunEvent(dependent);
        }
    }
    freezeEvent(type) {
        this.frozenEvents.add(type);
    }
    unfreezeEvent(type) {
        this.frozenEvents.delete(type);
    }
    async resetEvent(type, beforeReset) {
        const dependents = this.getDependentEvents(type);
        const eventsInProgress = [...dependents, type].filter(event => this.eventManager.getStatus(event) === EventStatus.IN_PROGRESS);
        dependents.forEach(event => this.freezeEvent(event));
        try {
            // wait for events to complete, and prevent dependents from running
            await Promise.all(eventsInProgress.map(event => this.waitForEvent(event)));
        }
        catch (e) {
            // ignore errors
        }
        dependents.forEach(event => this.unfreezeEvent(event));
        const eventsToReset = [type, ...dependents].filter(event => this.eventManager.getStatus(event) !== EventStatus.PENDING);
        if (beforeReset) {
            await beforeReset(eventsToReset);
        }
        for (const event of eventsToReset) {
            this.eventManager.resetEvent(event);
        }
        void this.tryRunEvent(type);
    }
    async resetEventsAfterTime(time) {
        const resetEvents = this.eventManager.resetEventsAfterTime(time);
        for (const event of resetEvents) {
            void this.tryRunEvent(event);
        }
    }
    getGraph() {
        return {
            dependencies: Object.fromEntries(Object.entries(this.dependencies).map(([k, v]) => [
                String(k),
                Array.from(v).map(String)
            ])),
            dependents: Object.fromEntries(Object.entries(this.dependents).map(([k, v]) => [
                String(k),
                Array.from(v).map(String)
            ])),
            completedEvents: this.eventManager.completedEvents,
            completedTimestamps: this.eventManager.completedTimestamps,
            failedTimestamps: this.eventManager.failedTimestamps,
            status: this.eventManager.eventStatus,
            errors: this.eventManager.errors,
        };
    }
    getDependentEvents(type) {
        const getDirectDependents = (eventType) => this.dependents[eventType] || new Set();
        const collectDependents = (eventType, accumulated = new Set()) => {
            const directDependents = getDirectDependents(eventType);
            return Array.from(directDependents).reduce((acc, dependent) => !acc.has(dependent)
                ? collectDependents(dependent, acc.add(dependent))
                : acc, accumulated);
        };
        return collectDependents(type);
    }
    activate(initialState) {
        if (this.isActive)
            return;
        this.isActive = true;
        if (initialState) {
            Object.keys(initialState.completed).forEach(type => {
                const { at, value } = initialState.completed[type];
                this.eventManager.completeEvent(type, value, at);
            });
            Object.keys(initialState.failed).forEach(type => {
                const { at, error } = initialState.failed[type];
                this.eventManager.failEvent(type, error, at);
            });
        }
        // TODO: make this more intelligent; we shouldn't need to try to run ALL pending events
        Object.keys(this.dependencies).forEach(type => {
            if (this.getEventStatus(type) === EventStatus.PENDING) {
                void this.tryRunEvent(type);
            }
        });
    }
    wouldCreateCycle(newDeps, targetEvent) {
        const getDependencies = (node) => {
            const nodeDependencies = new Set(this.dependencies[node]?.flat() || []);
            if (node === targetEvent) {
                newDeps.forEach(dep => nodeDependencies.add(dep));
            }
            return nodeDependencies;
        };
        for (const startNode of [...newDeps, targetEvent]) {
            const queue = [startNode];
            const visited = new Set();
            while (queue.length > 0) {
                const currentNode = queue.shift();
                if (currentNode === startNode && visited.has(currentNode)) {
                    return true;
                }
                const dependencies = getDependencies(currentNode);
                for (const dep of dependencies) {
                    if (!visited.has(dep)) {
                        queue.push(dep);
                        visited.add(dep);
                    }
                    else if (dep === startNode) {
                        return true;
                    }
                }
            }
        }
        return false;
    }
    getEventStatus(type) {
        return this.eventManager.getStatus(type);
    }
    decomposeDependencies(dependencies) {
        const requiredDeps = dependencies.filter(dep => typeof dep === 'string');
        const orGroups = dependencies
            .filter(dep => typeof dep === 'object' && 'or' in dep)
            .map(dep => dep);
        if (orGroups.length === 0) {
            return [requiredDeps];
        }
        const decomposedOrGroups = orGroups
            .map(group => group.or?.flatMap(or => this.decomposeDependencies(or)) || []);
        let results = decomposedOrGroups.shift();
        while (decomposedOrGroups.length > 0) {
            const group = decomposedOrGroups.shift();
            results = results.map(result => group.flatMap(g => [...result, ...g]));
        }
        return results.map(result => [...result, ...requiredDeps]);
    }
    checkDependenciesAndGetValues(type, dependencyGroups) {
        if (dependencyGroups.length === 0) {
            return {};
        }
        for (const group of dependencyGroups) {
            const allDepsCompleted = group.every(dep => this.eventManager.getStatus(dep) === EventStatus.COMPLETED);
            if (allDepsCompleted) {
                const values = group.reduce((acc, dep) => ({
                    ...acc,
                    [dep]: this.eventManager.getCompletedValue(dep)
                }), {});
                const predicatesPass = this.predicates[type]
                    .filter(predicate => {
                    if (!predicate.required)
                        return true;
                    return predicate.required.every(dep => this.eventManager.getStatus(dep) === EventStatus.COMPLETED);
                })
                    .every(predicate => !!predicate.fn(values));
                if (predicatesPass) {
                    return values;
                }
            }
        }
        return null;
    }
    waitForEvent(type) {
        if (this.eventManager.getStatus(type) === EventStatus.COMPLETED) {
            return Promise.resolve(this.eventManager.getCompletedValue(type));
        }
        else if (this.eventManager.getStatus(type) === EventStatus.FAILED) {
            return Promise.reject(this.eventManager.getError(type));
        }
        return new Promise((resolve, reject) => {
            const cleanup = () => {
                this.off('eventCompleted', successListener);
                this.off('eventFailed', failureListener);
            };
            const successListener = (eventName, value) => {
                if (eventName === type) {
                    resolve(value);
                    cleanup();
                }
            };
            const failureListener = (eventName, error) => {
                if (eventName === type) {
                    reject(error);
                    cleanup();
                }
            };
            this.on('eventCompleted', successListener);
            this.on('eventFailed', failureListener);
        });
    }
}
//# sourceMappingURL=DependencyGraph.js.map