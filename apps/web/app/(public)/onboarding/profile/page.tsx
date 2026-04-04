import { ProfileCompletionForm } from './profile-completion-form';

export default function OnboardingProfilePage({
  searchParams,
}: {
  searchParams?: { next?: string };
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-10">
      <ProfileCompletionForm returnPath={searchParams?.next ?? '/baseline'} />
    </main>
  );
}
