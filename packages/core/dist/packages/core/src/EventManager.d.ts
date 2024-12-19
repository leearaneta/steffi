import { EventEmitter } from 'events';
import { BaseEventPayloads, DependencyGraphOptions, EventStatus, EventError } from '@types';
export declare class EventManager<TEventPayloads extends BaseEventPayloads> {
    private emitter;
    private runnables;
    completedEvents: { [K in keyof TEventPayloads]: TEventPayloads[K]; };
    completedTimestamps: Record<keyof TEventPayloads, number>;
    eventOptions: Record<keyof TEventPayloads, Required<DependencyGraphOptions>>;
    eventStatus: Record<keyof TEventPayloads, EventStatus>;
    errors: Record<keyof TEventPayloads, EventError>;
    failedTimestamps: Record<keyof TEventPayloads, number>;
    private readonly defaultOptions;
    constructor(emitter: EventEmitter, options?: DependencyGraphOptions);
    registerEvent(type: keyof TEventPayloads, runnable: (args: Pick<TEventPayloads, Extract<keyof TEventPayloads, string>>) => Promise<void>, options?: DependencyGraphOptions): void;
    deregisterEvent(type: keyof TEventPayloads): void;
    completeEvent(type: keyof TEventPayloads, value: TEventPayloads[typeof type], at: Date): Promise<void>;
    executeEvent(type: keyof TEventPayloads, eventArgs: Pick<TEventPayloads, Extract<keyof TEventPayloads, string>>): Promise<void>;
    failEvent(type: keyof TEventPayloads, error: EventError, at: Date): void;
    resetEvent(type: keyof TEventPayloads): void;
    resetEventsAfterTime(time: Date): Set<keyof TEventPayloads>;
    getStatus(type: keyof TEventPayloads): EventStatus | undefined;
    getCompletedValue(type: keyof TEventPayloads): { [K in keyof TEventPayloads]: TEventPayloads[K]; }[keyof TEventPayloads];
    getError(type: keyof TEventPayloads): Record<keyof TEventPayloads, string>[keyof TEventPayloads];
}
