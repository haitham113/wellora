import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { createHmac } from 'node:crypto';

import type { EnvironmentVariables } from '../../config/environment.schema.js';

export interface SessionMetadata {
  deviceName: string | null;
  userAgent: string | null;
  ipHash: string | null;
}

@Injectable()
export class SessionMetadataService {
  private readonly hashSecret: string;

  constructor(@Inject(ConfigService) config: ConfigService<EnvironmentVariables, true>) {
    this.hashSecret = config.get('AUTH_METADATA_SECRET', { infer: true });
  }

  fromRequest(request: Request, deviceName?: string): SessionMetadata {
    const userAgent = request.get('user-agent');
    const ip = request.ip ?? request.socket.remoteAddress;

    return {
      deviceName: this.clean(deviceName, 120),
      userAgent: this.clean(userAgent, 512),
      ipHash:
        ip === undefined || ip.length === 0
          ? null
          : createHmac('sha256', this.hashSecret).update(ip, 'utf8').digest('hex'),
    };
  }

  private clean(value: string | undefined, maxLength: number): string | null {
    const cleaned = value?.trim();
    return cleaned === undefined || cleaned.length === 0 ? null : cleaned.slice(0, maxLength);
  }
}
