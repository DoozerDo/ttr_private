import { BadRequestException, ValidationError } from '@nestjs/common';

function hasConstraint(error: ValidationError, key: string): boolean {
  return Boolean(error.constraints && key in error.constraints);
}

export function bugReportValidationExceptionFactory(errors: ValidationError[]) {
  const hasMessageError = errors.some((error) => {
    if (error.property !== 'message' && error.property !== 'description') return false;
    return (
      hasConstraint(error, 'isNotEmpty') ||
      hasConstraint(error, 'minLength') ||
      hasConstraint(error, 'maxLength') ||
      hasConstraint(error, 'isString')
    );
  });

  if (hasMessageError) {
    return new BadRequestException('Please enter a message between 10 and 4000 characters.');
  }

  return new BadRequestException('Invalid bug report payload.');
}
