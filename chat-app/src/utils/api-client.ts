export type AuthSession = {
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
    user: {
      userId: string;
      email: string;
    };
  };
  
  export type RegisterResponse = {
    message: string;
    requiresEmailConfirmation: boolean;
  };
  
  export type GatewayUser = {
    userId: string;
    displayName: string;
    isOnline: boolean;
  };

  export type PublicKeyResponse = {
    userId: string;
    keyId: string;
    publicKey: string;
    updatedAt: string;
  };  
  
  type ApiErrorBody = {
    code?: string;
    message?: string;
  };
  
  export class ApiError extends Error {
    constructor(
      message: string,
      public readonly status: number,
      public readonly code?: string
    ) {
      super(message);
      this.name = 'ApiError';
    }
  }
  
  export const GATEWAY_HTTP_URL =
    process.env.EXPO_PUBLIC_GATEWAY_URL?.replace(/\/$/, '') ??
    'http://localhost';
  
  export const GATEWAY_WS_URL =
    GATEWAY_HTTP_URL.replace(/^http/, 'ws');
  
  async function request<T>(
    path: string,
    init: RequestInit = {}
  ): Promise<T> {
    const response = await fetch(
      `${GATEWAY_HTTP_URL}${path}`,
      init
    );
  
    if (response.status === 204) {
      return undefined as T;
    }
  
    let body: unknown;
  
    try {
      body = await response.json();
    } catch {
      body = null;
    }
  
    if (!response.ok) {
      const errorBody = body as ApiErrorBody | null;
  
      throw new ApiError(
        errorBody?.message ??
          `Gateway antwortet mit HTTP ${response.status}.`,
        response.status,
        errorBody?.code
      );
    }
  
    return body as T;
  }
  
  export function registerAccount(
    email: string,
    password: string
  ): Promise<RegisterResponse> {
    return request<RegisterResponse>(
      '/api/auth/register',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          password,
        }),
      }
    );
  }
  
  export function login(
    email: string,
    password: string
  ): Promise<AuthSession> {
    return request<AuthSession>(
      '/api/auth/login',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          password,
        }),
      }
    );
  }
  
  export function refreshAuthSession(
    refreshToken: string
  ): Promise<AuthSession> {
    return request<AuthSession>(
      '/api/auth/refresh',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          refreshToken,
        }),
      }
    );
  }
  
  export function logout(
    accessToken: string
  ): Promise<void> {
    return request<void>(
      '/api/auth/logout',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );
  }
  
  export function getUsers(
    accessToken: string
  ): Promise<GatewayUser[]> {
    return request<GatewayUser[]>(
      '/api/users',
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );
  }

  export function publishOwnPublicKey(
    accessToken: string,
    publicKey: string
  ): Promise<PublicKeyResponse> {
    return request<PublicKeyResponse>(
      '/api/users/me/public-key',
      {
        method: 'PUT',
        headers: {
          Authorization:
            `Bearer ${accessToken}`,
          'Content-Type':
            'application/json',
        },
        body: JSON.stringify({
          publicKey,
        }),
      }
    );
  }
  
  export function getUserPublicKey(
    accessToken: string,
    userId: string
  ): Promise<PublicKeyResponse> {
    return request<PublicKeyResponse>(
      `/api/users/${encodeURIComponent(userId)}/public-key`,
      {
        headers: {
          Authorization:
            `Bearer ${accessToken}`,
        },
      }
    );
  }