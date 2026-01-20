import { Module } from '@nestjs/common';
import { RelayEmailService } from './relay-email.service';

@Module({
  providers: [RelayEmailService],
  exports: [RelayEmailService],
})
export class EmailModule {}
