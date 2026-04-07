import { ValidationError } from '@nestjs/common';
import { bugReportValidationExceptionFactory } from './bug-report-validation';

describe('bugReportValidationExceptionFactory', () => {
  it('returns a clean message for invalid message payloads', () => {
    const error = bugReportValidationExceptionFactory([
      {
        property: 'message',
        constraints: {
          isNotEmpty: 'message should not be empty',
          minLength: 'message must be longer than or equal to 10 characters',
          maxLength: 'message must be shorter than or equal to 4000 characters',
          isString: 'message must be a string',
        },
      } as ValidationError,
    ]);

    expect(error.getResponse()).toMatchObject({
      message: 'Please enter a message between 10 and 4000 characters.',
    });
  });

  it('falls back to a generic bug report payload message for unrelated validation issues', () => {
    const error = bugReportValidationExceptionFactory([
      {
        property: 'route',
        constraints: {
          isString: 'route must be a string',
        },
      } as ValidationError,
    ]);

    expect(error.getResponse()).toMatchObject({
      message: 'Invalid bug report payload.',
    });
  });
});
