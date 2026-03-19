import { IsInt, Min } from 'class-validator';

export class StillSeeingDto {
  @IsInt()
  @Min(1)
  issueNumber!: number;
}
