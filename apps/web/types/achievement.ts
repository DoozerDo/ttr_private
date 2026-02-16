export type Achievement = {
  id: string;
  title: string;
  description: string;
  tier: 'bronze' | 'silver' | 'gold' | string;
  unlockedAt?: string;
  iconKey?: string;
  tone?: 'success' | 'neutral' | string;
};
