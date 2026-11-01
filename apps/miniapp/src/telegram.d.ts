export {};
declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData?: string;
        initDataUnsafe?: {
          start_param?: string;
          user?: {
            id: number;
            username?: string;
            first_name?: string;
            last_name?: string;
          };
        };
        ready?: () => void;
        colorScheme?: 'light' | 'dark';
        themeParams?: Record<string, string>;
        onEvent?: (event: 'themeChanged', callback: () => void) => void;
        offEvent?: (event: 'themeChanged', callback: () => void) => void;
        openInvoice?: (
          url: string,
          callback: (
            status: 'paid' | 'cancelled' | 'failed' | 'pending',
          ) => void,
        ) => void;
        isVersionAtLeast?: (version: string) => boolean;
        requestChat?: (id: string, callback: (sent: boolean) => void) => void;
      };
    };
  }
}
