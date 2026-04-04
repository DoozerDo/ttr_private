import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RealityCheck } from './reality-check.entity';

@Injectable()
export class RealityCheckRepository {
  constructor(
    @InjectRepository(RealityCheck)
    private readonly realityCheckRepository: Repository<RealityCheck>,
  ) {}

  async createRealityCheck(
    payload: Omit<RealityCheck, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<RealityCheck> {
    const entity = this.realityCheckRepository.create(payload);
    return this.realityCheckRepository.save(entity);
  }

  async findLatestByJobAndBaseline(
    jobId: string,
    baselineId: string,
  ): Promise<RealityCheck | null> {
    return this.realityCheckRepository.findOne({
      where: { jobId, baselineId },
      order: { createdAt: 'DESC' },
    });
  }
}
