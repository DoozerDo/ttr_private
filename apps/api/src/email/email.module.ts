import { Module } from '@nestjs/common';
import { RelayEmailService } from './relay-email.service';
import { ResendEmailService } from './resend-email.service';

@Module({
  providers: [RelayEmailService, ResendEmailService],
  exports: [RelayEmailService, ResendEmailService],
})
export class EmailModule {}
