export class CreateStarStoryDto {
  title!: string;
  situation!: string;
  task!: string;
  action!: string;
  result!: string;
  reflections?: string | null;
  competencies?: string[];
}
