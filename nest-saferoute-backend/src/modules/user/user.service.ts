import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { UserSettingsDto } from './dto/user-settings.dto';

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}

  async findById(id: string): Promise<User> {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }
    return user;
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.userRepository.findOne({ where: { email } });
  }

  async getSettings(userId: string): Promise<UserSettingsDto> {
    const user = await this.findById(userId);
    return {
      historyEnabled: user.settings?.historyEnabled ?? true,
      defaultSafetyWeight: user.settings?.defaultSafetyWeight ?? 0.8,
      defaultLookbackMonths: user.settings?.defaultLookbackMonths ?? 12,
    };
  }

  async updateSettings(
    userId: string,
    updateSettingsDto: UpdateSettingsDto,
  ): Promise<UserSettingsDto> {
    const user = await this.findById(userId);

    // Merge new settings with existing ones
    user.settings = {
      ...user.settings,
      ...updateSettingsDto,
    };

    await this.userRepository.save(user);

    this.logger.log(`Settings updated for user ${userId}`);

    return {
      historyEnabled: user.settings.historyEnabled,
      defaultSafetyWeight: user.settings.defaultSafetyWeight,
      defaultLookbackMonths: user.settings.defaultLookbackMonths,
    };
  }

  async updateLastLogin(userId: string): Promise<void> {
    await this.userRepository.update(userId, {
      lastLoginAt: new Date(),
    });
  }
}
