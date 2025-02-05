export type BaseEventPayloads = Record<string, any>

export type EventStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED'

export type DependencyPredicate<T extends BaseEventPayloads> = {
  fn: (args: Partial<T>, graph: GraphState) => boolean
  name: string;
  required?: Extract<keyof T, string>[],
}

export type DependencyGraphOptions = {
  maxRetries?: number;
  retryDelay?: number;
  timeout?: number;
  fireOnComplete?: boolean;
  allowCycles?: boolean;
  maxRuns?: number;
  initialState?: InitialState<BaseEventPayloads>;
}

type ArrayOrObject<T> = T | T[]

export type InitialState<T extends BaseEventPayloads> = {
  completed: Partial<{ [K in keyof T]: ArrayOrObject<{ at: Date, value: T[K] }> }>
  failed: Partial<{ [K in keyof T]: ArrayOrObject<{ at: Date, error: EventError }> }>
  initiated?: Partial<{ [K in keyof T]: ArrayOrObject<{ at: Date, predicates: string[] }> }>
}

export type EventOptions<T extends BaseEventPayloads> =
  Omit<Omit<DependencyGraphOptions, 'initialState'>, 'allowCycles'>
    & { predicates?: DependencyPredicate<T>[] }

export type NonCompletingEventOptions = {
  fireOnComplete: false;
}

export type CompletingEventOptions = {
  fireOnComplete?: true;
}

export type EventError = string;

export interface GraphState {
  dependencies: Record<string, string[][]>;
  dependents: Record<string, string[]>;
  initiatedEvents: Record<string, { at: Date, predicates: string[] }[]>;
  completedEvents: Record<string, { at: Date, value: any }[]>;
  failedEvents: Record<string, { at: Date, error: EventError }[]>;
  status: Record<string, EventStatus>;
  predicates: Record<string, DependencyPredicate<any>[]>;
  allowCycles: boolean;
}

export type GraphEvent = 
  | { type: 'GRAPH_REGISTERED'; payload: { name: string; initialState: GraphState } }
  | { type: 'EVENT_REGISTERED'; payload: { graphName: string; eventName: string; dependencies: string[][]; predicates: DependencyPredicate<any>[] } }
  | { type: 'EVENT_STARTED'; payload: { graphName: string; eventName: string; predicates: string[], at: Date } }
  | { type: 'EVENT_COMPLETED'; payload: { graphName: string; eventName: string; value: any; at: Date } }
  | { type: 'EVENT_FAILED'; payload: { graphName: string; eventName: string; error: EventError, at: Date } }

export type OrGroup<T extends BaseEventPayloads> = {
  or?: RecursiveDependency<T>[][]
}

export type RecursiveDependency<T extends BaseEventPayloads> = 
  | Extract<keyof T, string>
  | OrGroup<T>

export type Dependencies<T extends BaseEventPayloads> = RecursiveDependency<T>[]

export type DependencyGroup<T extends BaseEventPayloads> = Extract<keyof T, string>[]