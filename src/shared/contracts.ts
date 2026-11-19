import type { AppState, Task } from './domain-types';

export interface AppStateRepository {
  load(): AppState;
  save(): void;
}

export interface TaskRepository {
  load(): Task[];
  save(tasks: Task[]): void;
  findById(id: string): Task | undefined;
}

export interface TextAIProvider {
  complete(prompt: string): Promise<string>;
}
