export type HubProject = {
  id?: string;
  slug: string;
  name: string;
  summary: string;
  description: string;
  telegramUrl: string;
  status: string;
  visible?: boolean;
  version?: number;
};
export const projectStatuses: Record<string, string> = {
  ACTIVE: 'Работает',
  COMING_SOON: 'Скоро',
  PAUSED: 'На паузе',
};
