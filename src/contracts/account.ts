// 账号安全（DESIGN §8.1 API-AUTH-009、API-AUTH-010、API-AUTH-011）。请求体 preferencesBody、revokeSessionBody 在 ./auth。
export type SessionItem = {
  id: string;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  lastActiveAt: string;
  current: boolean;
};
export type SessionList = { items: SessionItem[] };
export type RevokeResult = { revoked: number };
export type PreferencesResult = { preferences: { desktopNotify: boolean; sound: boolean } };
