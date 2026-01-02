export const AUTH_COOKIE_NAME = "ttr_token";

export type JwtPayload = {
  sub?: string;
  email?: string;
  exp?: number;
};

export function decodeJwt(token: string): JwtPayload | null {
  try {
    const [, payload] = token.split(".");

    if (!payload) {
      return null;
    }

    const decoded = Buffer.from(payload, "base64").toString("utf8");
    return JSON.parse(decoded) as JwtPayload;
  } catch (error) {
    console.error("Failed to decode JWT", error);
    return null;
  }
}
