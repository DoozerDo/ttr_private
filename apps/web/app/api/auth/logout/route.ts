import { clearAuthCookie } from "../helpers";

export async function POST() {
  return clearAuthCookie();
}
