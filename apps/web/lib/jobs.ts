export interface JobDto {
  id: string;
  userId: string;
  title: string | null;
  company: string | null;
  rawDescription: string;
  createdAt: string;
  updatedAt: string;
}
