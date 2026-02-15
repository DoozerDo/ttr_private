import { ProfileCompletionForm } from './profile-completion-form';

export default function OnboardingProfilePage({
  searchParams,
}: {
  searchParams?: { next?: string };
}) {
  return <ProfileCompletionForm returnPath={searchParams?.next ?? '/baseline'} />;
}
