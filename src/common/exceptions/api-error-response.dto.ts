import { ApiExtraModels, ApiProperty, getSchemaPath } from '@nestjs/swagger';

export class ApiValidationViolationDto {
  @ApiProperty({ example: 'priceMinor' })
  field!: string;

  @ApiProperty({ example: 'INVALID_VALUE' })
  code!: string;

  @ApiProperty({ example: 'priceMinor must match the required format' })
  message!: string;
}

export class ApiValidationErrorDetailsDto {
  @ApiProperty({ type: ApiValidationViolationDto, isArray: true })
  violations!: ApiValidationViolationDto[];
}

export class ApiFieldListErrorDetailsDto {
  @ApiProperty({ type: String, isArray: true, example: ['priceMinor', 'currency'] })
  fields!: string[];
}

class ApiErrorDto {
  @ApiProperty({ example: 'INVALID_CREDENTIALS' })
  code!: string;

  @ApiProperty({ example: 'The email or password is incorrect.' })
  message!: string;

  @ApiProperty({
    nullable: true,
    oneOf: [
      { $ref: getSchemaPath(ApiValidationErrorDetailsDto) },
      { $ref: getSchemaPath(ApiFieldListErrorDetailsDto) },
      { type: 'object', additionalProperties: true },
    ],
  })
  details!: unknown;

  @ApiProperty({
    example: 'request-123',
    description: 'Opaque request correlation identifier, also returned in the x-request-id header',
  })
  requestId!: string;
}

@ApiExtraModels(
  ApiValidationViolationDto,
  ApiValidationErrorDetailsDto,
  ApiFieldListErrorDetailsDto,
)
export class ApiErrorResponseDto {
  @ApiProperty({ type: ApiErrorDto })
  error!: ApiErrorDto;
}
