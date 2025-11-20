import { ApiProperty } from '@nestjs/swagger';

export class UserResponseDto {
  @ApiProperty({
    example: 'a1b2c3d4-e5f6-4789-g0h1-i2j3k4l5m6n7',
    description: 'User ID',
  })
  id: string;

  @ApiProperty({
    example: 'user@example.com',
    description: 'User email',
  })
  email: string;

  @ApiProperty({
    example: true,
    description: 'Whether user account is active',
  })
  isActive: boolean;

  @ApiProperty({
    example: false,
    description: 'Whether user has admin privileges',
  })
  isAdmin: boolean;

  @ApiProperty({
    example: '2025-01-19T12:00:00.000Z',
    description: 'Account creation timestamp',
  })
  createdAt: Date;
}
