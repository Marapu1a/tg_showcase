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
