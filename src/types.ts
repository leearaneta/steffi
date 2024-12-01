export type BaseEventPayloads = Record<string, any>

export enum EventStatus {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED'
}

export type DependencyGraphOptions = {
  maxRetries?: number;
  retryDelay?: number;
  timeout?: number;
}

export interface EventError {
  error: string;
  timestamp: number;
}

export interface GraphState {
  dependencies: Map<string, Set<string>>;
  dependents: Map<string, Set<string>>;
  completedEvents: Map<string, any>;
  status: Map<string, EventStatus>;
  errors: Map<string, EventError>;
}

export type GraphEvent = 
  | { type: 'GRAPH_REGISTERED'; payload: { name: string; initialState: GraphState } }
  | { type: 'EVENT_REGISTERED'; payload: { graphName: string; eventName: string; dependencies: string[] } }
  | { type: 'EVENT_STARTED'; payload: { graphName: string; eventName: string } }
  | { type: 'EVENT_COMPLETED'; payload: { graphName: string; eventName: string; value: any } }
  | { type: 'EVENT_FAILED'; payload: { graphName: string; eventName: string; error: EventError } } 