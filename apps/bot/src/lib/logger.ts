type Context = Record<string, unknown> | undefined;

function write(level: 'info' | 'error', message: string, error?: unknown, context?: Context) {
  const payload = {
    level,
    message,
    error:
      error instanceof Error
        ? {
            name: error.name,
            message: error.message,
            stack: error.stack,
          }
        : error,
    context,
  };

  const line = JSON.stringify(payload);

  if (level === 'error') {
    console.error(line);
    return;
  }

  console.log(line);
}

export const logger = {
  info(message: string, context?: Context) {
    write('info', message, undefined, context);
  },
  error(message: string, error?: unknown, context?: Context) {
    write('error', message, error, context);
  },
};
