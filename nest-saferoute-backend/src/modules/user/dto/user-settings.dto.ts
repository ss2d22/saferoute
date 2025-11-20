import { ApiProperty } from '@nestjs/swagger';

export class UserSettingsDto {
  @ApiProperty({
    example: true,
    description: 'Whether route history is enabled',
  })
  historyEnabled: boolean;

  @ApiProperty({
    example: 0.8,
    description: 'Default safety weight',
  })
  defaultSafetyWeight: number;

  @ApiProperty({
    example: 12,
    description: 'Default lookback months',
  })
  defaultLookbackMonths: number;
}
