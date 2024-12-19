export type BaseEventPayloads = Record<string, any>

export type EventStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED'

export type DependencyPredicate<T extends BaseEventPayloads> = {
  fn: (args: Pick<T, Extract<keyof T, string>>) => boolean
  name: string;
  required?: Extract<keyof T, string>[],
  passed: boolean
}

export type DependencyGraphOptions = {
  maxRetries?: number;
  retryDelay?: number;
  timeout?: number;
  fireOnComplete?: boolean;
}

export type EventOptions<T extends BaseEventPayloads> = DependencyGraphOptions & {
  predicates?: Omit<DependencyPredicate<T>, 'passed'>[];
}

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
  completedEvents: Record<string, any>;
  completedTimestamps: Record<string, number>;
  status: Record<string, EventStatus>;
  errors: Record<string, EventError>;
  failedTimestamps: Record<string, number>;
  predicates: Record<string, DependencyPredicate<any>[]>;
}

export type GraphEvent = 
  | { type: 'GRAPH_REGISTERED'; payload: { name: string; initialState: GraphState } }
  | { type: 'EVENT_REGISTERED'; payload: { graphName: string; eventName: string; dependencies: string[][]; predicates: DependencyPredicate<any>[] } }
  | { type: 'EVENT_STARTED'; payload: { graphName: string; eventName: string; predicates: string[] } }
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