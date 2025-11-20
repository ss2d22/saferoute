import {
  Controller,
  Get,
  Patch,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { UserService } from './user.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { UserSettingsDto } from './dto/user-settings.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('users')
@Controller('users')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get('me/settings')
  @ApiOperation({ summary: 'Get current user settings' })
  @ApiResponse({
    status: 200,
    description: 'User settings retrieved',
    type: UserSettingsDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getSettings(@Request() req: any): Promise<UserSettingsDto> {
    return this.userService.getSettings(req.user.id);
  }

  @Patch('me/settings')
  @ApiOperation({ summary: 'Update current user settings' })
  @ApiResponse({
    status: 200,
    description: 'Settings updated successfully',
    type: UserSettingsDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async updateSettings(
    @Request() req: any,
    @Body() updateSettingsDto: UpdateSettingsDto,
  ): Promise<UserSettingsDto> {
    return this.userService.updateSettings(req.user.id, updateSettingsDto);
  }
}
