export {};
declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData?: string;
        initDataUnsafe?: {
          user?: {
            id: number;
            username?: string;
            first_name?: string;
            last_name?: string;
          };
        };
        ready?: () => void;
        isVersionAtLeast?: (version: string) => boolean;
        requestChat?: (id: string, callback: (sent: boolean) => void) => void;
      };
    };
  }
}
