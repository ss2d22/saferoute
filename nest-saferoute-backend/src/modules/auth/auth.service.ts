import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from '../user/entities/user.entity';
import { RegisterDto } from './dto/register.dto';
import { AuthResponseDto } from './dto/auth-response.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async register(registerDto: RegisterDto): Promise<AuthResponseDto> {
    const { email, password } = registerDto;

    // Check if user already exists
    const existingUser = await this.userRepository.findOne({
      where: { email },
    });

    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    // Hash password
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Create user
    const user = this.userRepository.create({
      email,
      passwordHash,
      isActive: true,
      isAdmin: false,
      settings: {
        historyEnabled: true,
        defaultSafetyWeight: this.configService.get('safety.defaultSafetyWeight'),
        defaultLookbackMonths: this.configService.get(
          'safety.defaultLookbackMonths',
        ),
      },
    });

    await this.userRepository.save(user);

    this.logger.log(`New user registered: ${email}`);

    return this.generateTokens(user);
  }

  async login(user: User): Promise<AuthResponseDto> {
    // Update last login
    user.lastLoginAt = new Date();
    await this.userRepository.save(user);

    this.logger.log(`User logged in: ${user.email}`);

    return this.generateTokens(user);
  }

  async validateUser(email: string, password: string): Promise<User | null> {
    const user = await this.userRepository.findOne({ where: { email } });

    if (!user || !user.isActive) {
      return null;
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

    if (!isPasswordValid) {
      return null;
    }

    return user;
  }

  async refreshToken(refreshToken: string): Promise<AuthResponseDto> {
    try {
      const payload = this.jwtService.verify(refreshToken, {
        secret: this.configService.get<string>('jwt.secret'),
      });

      const user = await this.userRepository.findOne({
        where: { id: payload.sub },
      });

      if (!user || !user.isActive) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      return this.generateTokens(user);
    } catch (error) {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  private generateTokens(user: User): AuthResponseDto {
    const payload = { sub: user.id, email: user.email };

    const accessTokenExpiration = this.configService.get<string>(
      'jwt.accessTokenExpiration',
    ) || '15m';
    const refreshTokenExpiration = this.configService.get<string>(
      'jwt.refreshTokenExpiration',
    ) || '30d';

    const accessToken = this.jwtService.sign(payload, {
      expiresIn: accessTokenExpiration as any,
    });

    const refreshToken = this.jwtService.sign(payload, {
      expiresIn: refreshTokenExpiration as any,
    });

    // Convert expiration string to seconds (e.g., "15m" -> 900)
    const expiresIn = this.parseExpirationToSeconds(accessTokenExpiration);

    return {
      accessToken,
      refreshToken,
      tokenType: 'bearer',
      expiresIn,
    };
  }

  private parseExpirationToSeconds(expiration: string): number {
    const unit = expiration.slice(-1);
    const value = parseInt(expiration.slice(0, -1), 10);

    switch (unit) {
      case 's':
        return value;
      case 'm':
        return value * 60;
      case 'h':
        return value * 60 * 60;
      case 'd':
        return value * 60 * 60 * 24;
      default:
        return 900; // Default 15 minutes
    }
  }

  async getUserById(id: string): Promise<User | null> {
    return this.userRepository.findOne({ where: { id } });
  }
}
