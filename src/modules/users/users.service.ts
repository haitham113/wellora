import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import type { UserResponseDto } from './dto/user-response.dto.js';

@Injectable()
export class UsersService {
  constructor(private readonly database: PrismaService) {}

  async getById(userId: string): Promise<UserResponseDto> {
    const user = await this.database.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        status: true,
        platformRole: true,
        emailVerifiedAt: true,
        createdAt: true,
      },
    });

    if (user === null) {
      throw new NotFoundException('User not found.');
    }

    return {
      ...user,
      emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
      createdAt: user.createdAt.toISOString(),
    };
  }
}
