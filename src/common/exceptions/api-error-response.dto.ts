import { ApiProperty } from '@nestjs/swagger';

class ApiErrorDto {
  @ApiProperty({ example: 'INVALID_CREDENTIALS' })
  code!: string;

  @ApiProperty({ example: 'The email or password is incorrect.' })
  message!: string;

  @ApiProperty({ type: Object, nullable: true })
  details!: unknown;

  @ApiProperty({ format: 'uuid' })
  requestId!: string;
}

export class ApiErrorResponseDto {
  @ApiProperty({ type: ApiErrorDto })
  error!: ApiErrorDto;
}
