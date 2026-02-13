import { AccessCodeForm } from "./access-code-form";

export default function AccessCodePage({
  searchParams,
}: {
  searchParams?: { email?: string; next?: string };
}) {
  return <AccessCodeForm initialEmail={searchParams?.email ?? ""} returnPath={searchParams?.next ?? "/"} />;
}
