import { HttpException, type HttpStatus } from '@nestjs/common';

export interface ApplicationErrorBody {
  code: string;
  message: string;
  details: unknown;
}

export class ApplicationException extends HttpException {
  constructor(status: HttpStatus, body: ApplicationErrorBody) {
    super(body, status);
  }
}
