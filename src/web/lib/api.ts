export class ApiError extends Error {
  status: number;
  code?: string;
  feature?: string;

  constructor(message: string, status: number, code?: string, feature?: string) {
    super(message);
    this.status = status;
    this.code = code;
    this.feature = feature;
  }
}

type UnauthorizedHandler = () => void;
let unauthorizedHandler: UnauthorizedHandler | null = null;

export function setUnauthorizedHandler(handler: UnauthorizedHandler | null) {
  unauthorizedHandler = handler;
}

const DEFAULT_TIMEOUT_MS = 15_000;

export async function apiRequest<T>(
  path: string,
  init?: RequestInit & { timeoutMs?: number }
): Promise<T> {
  const controller = new AbortController();
  const timeoutMs = init?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const externalSignal = init?.signal;

  const onExternalAbort = () => controller.abort(externalSignal?.reason);
  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort(externalSignal.reason);
    } else {
      externalSignal.addEventListener('abort', onExternalAbort, { once: true });
    }
  }

  const timer = window.setTimeout(() => controller.abort(new Error('TIMEOUT')), timeoutMs);

  try {
    const response = await fetch(path, {
      credentials: 'include',
      ...init,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    });

    const data = (await response.json().catch(() => ({}))) as {
      error?: string;
      code?: string;
      feature?: string;
    };

    if (!response.ok) {
      if (
        response.status === 401 &&
        unauthorizedHandler &&
        !path.startsWith('/api/auth/login') &&
        !path.startsWith('/api/auth/register')
      ) {
        unauthorizedHandler();
      }
      throw new ApiError(
        data.error || `Erro HTTP ${response.status}`,
        response.status,
        data.code,
        data.feature
      );
    }

    return data as T;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new ApiError('Tempo limite da requisição excedido.', 408, 'TIMEOUT');
    }
    throw err;
  } finally {
    window.clearTimeout(timer);
    if (externalSignal) {
      externalSignal.removeEventListener('abort', onExternalAbort);
    }
  }
}
