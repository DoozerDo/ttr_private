import { Type } from "class-transformer";
import { IsArray, IsIn, IsNotEmpty, IsString, ValidateNested } from "class-validator";
import {
  FIT_REVIEW_DIMENSIONS,
  type FitReviewDimensionKey,
} from "../fit-review-dimensions";

export class FitReviewAdditionDto {
  @IsString()
  @IsNotEmpty()
  @IsIn(FIT_REVIEW_DIMENSIONS)
  dimensionId!: FitReviewDimensionKey;

  @IsString()
  @IsNotEmpty()
  approvedText!: string;
}

export class CloneFitReviewBaselineDto {
  @IsString()
  @IsNotEmpty()
  jobId!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FitReviewAdditionDto)
  additions!: FitReviewAdditionDto[];
}
