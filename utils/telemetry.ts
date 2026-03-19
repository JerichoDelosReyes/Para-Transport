let sequence = 0;

function nowIso(): string {
  return new Date().toISOString();
}

function safePayload(payload: unknown): string {
  if (payload === undefined) {
    return '';
  }

  try {
    return JSON.stringify(payload);
  } catch {
    return '[unserializable-payload]';
  }
}

export function logTrace(scope: string, event: string, payload?: Record<string, unknown>): void {
  const enabled = typeof __DEV__ !== 'undefined' ? __DEV__ : true;
  if (!enabled) {
    return;
  }

  sequence += 1;
  const line = `[ParaTrace][${nowIso()}][#${String(sequence).padStart(4, '0')}][${scope}] ${event}`;
  const body = safePayload(payload);

  if (body) {
    console.log(`${line} ${body}`);
    return;
  }

  console.log(line);
}

export function logError(scope: string, event: string, error: unknown, payload?: Record<string, unknown>): void {
  const enabled = typeof __DEV__ !== 'undefined' ? __DEV__ : true;
  if (!enabled) {
    return;
  }

  sequence += 1;

  const normalizedError =
    error instanceof Error
      ? {
          name: error.name,
          message: error.message,
          stack: error.stack,
        }
      : { message: String(error) };

  const line = `[ParaTrace][${nowIso()}][#${String(sequence).padStart(4, '0')}][${scope}] ${event}`;
  console.warn(`${line} ${safePayload({ ...payload, error: normalizedError })}`);
}
