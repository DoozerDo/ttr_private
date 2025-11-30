import { forwardAuthRequest } from "../helpers";

export async function POST(request: Request) {
  const payload = await request.json();
  return forwardAuthRequest("/auth/login", payload);
}
