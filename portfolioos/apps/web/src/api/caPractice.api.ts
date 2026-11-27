import { api, unwrap } from './client';
import type { ApiResponse } from '@everypaisa/shared';

export interface ClientNote {
  id: string;
  clientId: string;
  body: string;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
}

export type ClientTaskStatus = 'OPEN' | 'DONE';

export interface ClientTask {
  id: string;
  clientId: string;
  title: string;
  /** ISO timestamp at UTC midnight of the due day, or null. */
  dueDate: string | null;
  status: ClientTaskStatus;
  doneAt: string | null;
  createdAt: string;
}

export interface OpenTaskRow {
  id: string;
  clientId: string;
  clientName: string;
  title: string;
  dueDate: string | null;
}

const base = (clientId: string) => `/api/ca/clients/${clientId}`;

export const caPracticeApi = {
  async notes(clientId: string): Promise<ClientNote[]> {
    const { data } = await api.get<ApiResponse<ClientNote[]>>(`${base(clientId)}/notes`);
    return unwrap(data);
  },
  async addNote(clientId: string, body: string): Promise<ClientNote> {
    const { data } = await api.post<ApiResponse<ClientNote>>(`${base(clientId)}/notes`, { body });
    return unwrap(data);
  },
  async updateNote(clientId: string, id: string, patch: { body?: string; pinned?: boolean }): Promise<void> {
    await api.patch(`${base(clientId)}/notes/${id}`, patch);
  },
  async deleteNote(clientId: string, id: string): Promise<void> {
    await api.delete(`${base(clientId)}/notes/${id}`);
  },

  async tasks(clientId: string): Promise<ClientTask[]> {
    const { data } = await api.get<ApiResponse<ClientTask[]>>(`${base(clientId)}/tasks`);
    return unwrap(data);
  },
  async addTask(clientId: string, input: { title: string; dueDate?: string | null }): Promise<ClientTask> {
    const { data } = await api.post<ApiResponse<ClientTask>>(`${base(clientId)}/tasks`, input);
    return unwrap(data);
  },
  async updateTask(
    clientId: string,
    id: string,
    patch: { title?: string; dueDate?: string | null; status?: ClientTaskStatus },
  ): Promise<void> {
    await api.patch(`${base(clientId)}/tasks/${id}`, patch);
  },
  async deleteTask(clientId: string, id: string): Promise<void> {
    await api.delete(`${base(clientId)}/tasks/${id}`);
  },

  async openTasks(): Promise<OpenTaskRow[]> {
    const { data } = await api.get<ApiResponse<OpenTaskRow[]>>('/api/ca/tasks');
    return unwrap(data);
  },
};
