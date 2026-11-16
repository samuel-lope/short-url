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

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: 'include',
    ...init,
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
    throw new ApiError(
      data.error || `Erro HTTP ${response.status}`,
      response.status,
      data.code,
      data.feature
    );
  }

  return data as T;
}
