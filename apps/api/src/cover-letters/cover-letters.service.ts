import { Injectable } from '@nestjs/common';
import { GenerateCoverLetterDto } from './dto/generate-cover-letter.dto';

@Injectable()
export class CoverLettersService {
  buildNotImplementedResponse(
    _userId: string,
    _input: GenerateCoverLetterDto,
  ) {
    return {
      status: 'not_implemented',
      message: 'Cover letter generation is not implemented yet.',
    };
  }
}
