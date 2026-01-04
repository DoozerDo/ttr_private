import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Interview } from "./interview.entity";
import { CreateInterviewRecordDto } from "./dto/create-interview.dto";

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string")
    : [];
}

function asObjectArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter(
        (v): v is Record<string, unknown> => typeof v === "object" && v !== null,
      )
    : [];
}

@Injectable()
export class InterviewRecordsService {
  constructor(
    @InjectRepository(Interview)
    private readonly interviewsRepo: Repository<Interview>,
  ) {}

  /**
   * Controller expects this exact method name.
   */
  async createInterviewRecord(
    userId: string,
    dto: CreateInterviewRecordDto,
  ): Promise<Interview> {
    // Create an empty entity instance first to avoid TS errors from unknown columns
    const interview = this.interviewsRepo.create() as unknown as Interview;

    // userId is a known column per your build errors
    (interview as any).userId = userId;

    // Copy dto fields without TypeScript enforcing exact Interview shape
    Object.assign(interview as any, dto as any);

    // Normalize known array-ish fields if present in dto
    if ("gapList" in (dto as any)) (interview as any).gapList = asObjectArray((dto as any).gapList);
    if ("questions" in (dto as any)) (interview as any).questions = asObjectArray((dto as any).questions);
    if ("responses" in (dto as any)) (interview as any).responses = asStringArray((dto as any).responses);
    if ("recommendedAdditions" in (dto as any)) {
      (interview as any).recommendedAdditions = asStringArray((dto as any).recommendedAdditions);
    }

    return this.interviewsRepo.save(interview);
  }

  /**
   * Controller expects this exact method name.
   */
  async listInterviewRecordsForUser(userId: string): Promise<Interview[]> {
    return this.interviewsRepo.find({
      where: { userId } as any,
      order: { createdAt: "DESC" } as any,
    });
  }

  /**
   * Controller expects this exact method name and parameter order.
   * Your controller calls: getInterviewRecordForUser(id, userId)
   */
  async getInterviewRecordForUser(
    id: string,
    userId: string,
  ): Promise<Interview | null> {
    return this.interviewsRepo.findOne({
      where: { id, userId } as any,
    });
  }

  /**
   * Controller expects this exact method name.
   * Uses a permissive patch approach since entity fields vary across branches.
   */
  async updateInterviewRecord(
    id: string,
    userId: string,
    dto: Partial<CreateInterviewRecordDto>,
  ): Promise<Interview> {
    const interview = await this.interviewsRepo.findOne({
      where: { id, userId } as any,
    });

    if (!interview) {
      throw new NotFoundException("Interview record not found");
    }

    Object.assign(interview as any, dto as any);

    if ("gapList" in (dto as any)) (interview as any).gapList = asObjectArray((dto as any).gapList);
    if ("questions" in (dto as any)) (interview as any).questions = asObjectArray((dto as any).questions);
    if ("responses" in (dto as any)) (interview as any).responses = asStringArray((dto as any).responses);
    if ("recommendedAdditions" in (dto as any)) {
      (interview as any).recommendedAdditions = asStringArray((dto as any).recommendedAdditions);
    }

    return this.interviewsRepo.save(interview);
  }

  /**
   * Controller expects this exact method name.
   */
  async deleteInterviewRecord(
    id: string,
    userId: string,
  ): Promise<{ deleted: true }> {
    const result = await this.interviewsRepo.delete({ id, userId } as any);

    if (!result.affected) {
      throw new NotFoundException("Interview record not found");
    }

    return { deleted: true };
  }

  /**
   * Backward-compatible aliases (in case other code calls the newer names).
   */
  async createInterview(userId: string, dto: CreateInterviewRecordDto): Promise<Interview> {
    return this.createInterviewRecord(userId, dto);
  }

  async getInterviewsForUser(userId: string): Promise<Interview[]> {
    return this.listInterviewRecordsForUser(userId);
  }

  async getInterviewById(userId: string, interviewId: string): Promise<Interview | null> {
    return this.getInterviewRecordForUser(interviewId, userId);
  }
}
