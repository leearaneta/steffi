export type BaseEventPayloads = Record<string, any>

export enum EventStatus {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED'
}

export type DependencyPredicate<T extends BaseEventPayloads> = {
  fn: (args: Pick<T, Extract<keyof T, string>>) => boolean
  required?: Extract<keyof T, string>[]
  name?: string;
}

export type DependencyGraphOptions = {
  maxRetries?: number;
  retryDelay?: number;
  timeout?: number;
  fireOnComplete?: boolean;
}

export type EventOptions<T extends BaseEventPayloads> = DependencyGraphOptions & {
  predicates?: DependencyPredicate<T>[]
}

export interface EventError {
  error: string;
  timestamp: number;
}

export interface GraphState {
  dependencies: Record<string, string[]>;
  dependents: Record<string, string[]>;
  completedEvents: Record<string, any>;
  completedTimestamps: Record<string, number>;
  status: Record<string, EventStatus>;
  errors: Record<string, EventError>;
}

export type GraphEvent = 
  | { type: 'GRAPH_REGISTERED'; payload: { name: string; initialState: GraphState } }
  | { type: 'EVENT_REGISTERED'; payload: { graphName: string; eventName: string; dependencies: string[] } }
  | { type: 'EVENT_STARTED'; payload: { graphName: string; eventName: string } }
  | { type: 'EVENT_COMPLETED'; payload: { graphName: string; eventName: string; value: any } }
  | { type: 'EVENT_FAILED'; payload: { graphName: string; eventName: string; error: EventError } }

export type OrGroup<T extends BaseEventPayloads> = {
  or?: RecursiveDependency<T>[][]
}

export type RecursiveDependency<T extends BaseEventPayloads> = 
  | Extract<keyof T, string>
  | OrGroup<T>

export type Dependencies<T extends BaseEventPayloads> = RecursiveDependency<T>[]

export type DependencyGroup<T extends BaseEventPayloads> = Extract<keyof T, string>[]

// ['a', 'b', { or: [['e', 'f'], ['g', 'h']] }, { or: [['i', 'j'], ['k', { or: [['l'], ['m']] }]] }]
// would decompose into
// [
//   ['a', 'b', 'e', 'f', 'i', 'j'],
//   ['a', 'b', 'e', 'f', 'k', 'l'],
//   ['a', 'b', 'g', 'h', 'i', 'j'],
//   ['a', 'b', 'g', 'h', 'k', 'l'],
// ]




