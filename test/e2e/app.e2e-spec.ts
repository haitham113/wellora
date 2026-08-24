import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { Server } from 'node:http';

import { AppModule } from '../../src/app.module.js';
import { configureApplication } from '../../src/bootstrap.js';
import type { EnvironmentVariables } from '../../src/config/environment.schema.js';

describe('application foundation (e2e)', () => {
  let app: INestApplication;
  let httpServer: Server;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    const config = app.get<ConfigService<EnvironmentVariables, true>>(ConfigService);
    configureApplication(app, config);
    await app.init();
    httpServer = app.getHttpServer() as Server;
  });

  afterAll(async () => {
    await app.close();
  });

  it('exposes unversioned liveness and propagates a trusted request id', async () => {
    const response = await request(httpServer)
      .get('/health')
      .set('x-request-id', 'phase-1-test')
      .expect(200);

    expect(response.headers['x-request-id']).toBe('phase-1-test');
    expect(response.body as unknown).toMatchObject({ status: 'ok' });
  });

  it('keeps business routes under the versioned prefix', async () => {
    const response = await request(httpServer)
      .get('/missing')
      .set('x-request-id', 'missing-route-test')
      .expect(404);

    expect(response.body as unknown).toEqual({
      error: {
        code: 'HTTP_NOT_FOUND',
        message: 'Cannot GET /missing',
        details: null,
        requestId: 'missing-route-test',
      },
    });
  });

  it('reports dependency readiness without exposing connection errors', async () => {
    const response = await request(httpServer).get('/health/ready');

    if (process.env.EXPECT_DEPENDENCIES_READY === 'true') {
      expect(response.status).toBe(200);
    }

    if (response.status === 200) {
      expect(response.body as unknown).toMatchObject({
        status: 'ok',
        dependencies: {
          database: { status: 'up' },
          redis: { status: 'up' },
        },
      });
      return;
    }

    expect(response.status).toBe(503);
    expect(response.body as unknown).toMatchObject({
      error: {
        code: 'DEPENDENCY_UNAVAILABLE',
        message: 'One or more required dependencies are unavailable.',
      },
    });
    expect(JSON.stringify(response.body as unknown)).not.toContain('ECONNREFUSED');
  });
});
