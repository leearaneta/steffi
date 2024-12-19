import { EventEmitter } from 'events';
import { Dependencies, DependencyGraphOptions, BaseEventPayloads, GraphState, EventStatus, EventOptions, EventError } from '@types';
export declare class DependencyGraph<TEventPayloads extends BaseEventPayloads> extends EventEmitter {
    private dependencies;
    private dependents;
    private eventManager;
    private predicates;
    private defaultOptions;
    private frozenEvents;
    isActive: boolean;
    constructor(options?: DependencyGraphOptions);
    private tryRunEvent;
    registerEvent<TDeps extends Extract<keyof TEventPayloads, string>>(type: keyof TEventPayloads, dependencies: Dependencies<TEventPayloads>, runnable: (args: Pick<TEventPayloads, TDeps>) => Promise<TEventPayloads[typeof type]>, options?: EventOptions<TEventPayloads> & {
        fireOnComplete?: true;
    }): void;
    registerEvent<TDeps extends Extract<keyof TEventPayloads, string>>(type: keyof TEventPayloads, dependencies: Dependencies<TEventPayloads>, runnable: (args: Pick<TEventPayloads, TDeps>) => Promise<void>, options: EventOptions<TEventPayloads> & {
        fireOnComplete: false;
    }): void;
    completeEvent(type: keyof TEventPayloads, value?: TEventPayloads[typeof type]): Promise<void>;
    freezeEvent(type: keyof TEventPayloads): void;
    unfreezeEvent(type: keyof TEventPayloads): void;
    resetEvent(type: keyof TEventPayloads, beforeReset?: (events: (keyof TEventPayloads)[]) => Promise<void>): Promise<void>;
    resetEventsAfterTime(time: Date): Promise<void>;
    getGraph(): GraphState;
    private getDependentEvents;
    activate(initialState?: {
        completed: Partial<{
            [K in keyof TEventPayloads]: {
                at: Date;
                value: TEventPayloads[K];
            };
        }>;
        failed: Partial<{
            [K in keyof TEventPayloads]: {
                at: Date;
                error: EventError;
            };
        }>;
    }): void;
    private wouldCreateCycle;
    getEventStatus(type: keyof TEventPayloads): EventStatus | undefined;
    private decomposeDependencies;
    private checkDependenciesAndGetValues;
    waitForEvent(type: keyof TEventPayloads): Promise<TEventPayloads[typeof type]>;
}
