import { EventStatus } from '@types';
export class EventManager {
    constructor(emitter, options = {}) {
        this.emitter = emitter;
        this.runnables = {};
        this.completedEvents = {};
        this.completedTimestamps = {};
        this.eventOptions = {};
        this.eventStatus = {};
        this.errors = {};
        this.failedTimestamps = {};
        this.defaultOptions = {
            maxRetries: options.maxRetries ?? 1,
            retryDelay: options.retryDelay ?? 1000,
            timeout: options.timeout ?? 1000000,
            fireOnComplete: options.fireOnComplete ?? true
        };
    }
    registerEvent(type, runnable, options = {}) {
        const mergedOptions = {
            ...this.defaultOptions,
            ...options
        };
        this.eventOptions[type] = mergedOptions;
        this.runnables[type] = runnable;
        this.eventStatus[type] = EventStatus.PENDING;
    }
    deregisterEvent(type) {
        delete this.runnables[type];
        delete this.completedEvents[type];
        delete this.completedTimestamps[type];
        delete this.eventOptions[type];
        delete this.eventStatus[type];
        delete this.errors[type];
    }
    async completeEvent(type, value, at) {
        if ([EventStatus.FAILED, EventStatus.COMPLETED].includes(this.eventStatus[type])) {
            console.warn('event already', this.eventStatus[type] === EventStatus.FAILED ? 'failed' : 'completed', type);
            return;
        }
        this.completedEvents[type] = value;
        this.completedTimestamps[type] = at ? at.getTime() : Date.now();
        this.eventStatus[type] = EventStatus.COMPLETED;
    }
    async executeEvent(type, eventArgs) {
        const options = this.eventOptions[type] ?? this.defaultOptions;
        const { maxRetries, retryDelay, timeout } = options;
        const executeWithRetries = async (retryCount = 0) => {
            try {
                this.eventStatus[type] = EventStatus.IN_PROGRESS;
                this.emitter.emit('eventStarted', type);
                const timeoutPromise = new Promise((_, reject) => {
                    setTimeout(() => reject(new Error(`Event ${String(type)} timed out after ${timeout}ms`)), timeout);
                });
                const runnable = this.runnables[type];
                if (runnable) {
                    await Promise.race([
                        runnable(eventArgs),
                        timeoutPromise
                    ]);
                }
            }
            catch (error) {
                if (retryCount < maxRetries) {
                    this.eventStatus[type] = EventStatus.PENDING;
                    await new Promise(resolve => setTimeout(resolve, retryDelay));
                    return executeWithRetries(retryCount + 1);
                }
                const eventError = error instanceof Error ? error.message : String(error);
                const now = new Date();
                this.failEvent(type, eventError, now);
                this.emitter.emit('eventFailed', type, eventError, now);
                console.error('event failed', type, eventError);
            }
        };
        await executeWithRetries();
    }
    failEvent(type, error, at) {
        if ([EventStatus.FAILED, EventStatus.COMPLETED].includes(this.eventStatus[type])) {
            console.warn('event already', this.eventStatus[type] === EventStatus.FAILED ? 'failed' : 'completed', type);
            return;
        }
        this.failedTimestamps[type] = at.getTime();
        this.eventStatus[type] = EventStatus.FAILED;
        this.errors[type] = error;
    }
    resetEvent(type) {
        delete this.completedEvents[type];
        delete this.completedTimestamps[type];
        this.eventStatus[type] = EventStatus.PENDING;
        delete this.errors[type];
    }
    resetEventsAfterTime(time) {
        const eventsToReset = new Set();
        for (const [key, timestamp] of Object.entries(this.completedTimestamps)) {
            if (timestamp > time.getTime()) {
                eventsToReset.add(key);
            }
        }
        for (const eventType of eventsToReset) {
            this.resetEvent(eventType);
        }
        return eventsToReset;
    }
    getStatus(type) {
        return this.eventStatus[type];
    }
    getCompletedValue(type) {
        return this.completedEvents[type];
    }
    getError(type) {
        return this.errors[type];
    }
}
//# sourceMappingURL=EventManager.js.map