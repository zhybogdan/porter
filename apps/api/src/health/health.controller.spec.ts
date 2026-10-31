import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module.js';
import { configureApp } from '../app.setup.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { truncateAll } from '../test/db.js';
import type { HealthReport } from './health.service.js';

describe('health against a real database', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let server: Parameters<typeof request>[0];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = configureApp(moduleRef.createNestApplication());
    await app.init();
    prisma = app.get(PrismaService);
    server = app.getHttpServer() as Parameters<typeof request>[0];
  });

  afterEach(async () => {
    await truncateAll(prisma);
  });

  afterAll(async () => {
    await app.close();
  });

  it('answers 200 with the database up', async () => {
    const response = await request(server).get('/health').expect(200);
    const body = response.body as HealthReport;

    expect(body.status).toBe('ok');
    expect(body.database).toBe('up');
  });

  it('writes and reads a row through the generated client', async () => {
    const created = await prisma.organization.create({
      data: { name: 'Demo Property Group' },
    });

    // The id came from the database default, so this also proves the
    // migration's uuidv7() default is in place and reachable through Prisma.
    expect(created.id).toMatch(/^[0-9a-f-]{36}$/);

    const found = await prisma.organization.findUniqueOrThrow({
      where: { id: created.id },
    });
    expect(found.name).toBe('Demo Property Group');
  });

  it('starts each test with empty tables', async () => {
    expect(await prisma.organization.count()).toBe(0);
  });
});

describe('health when the database is unreachable', () => {
  let app: INestApplication;
  let server: Parameters<typeof request>[0];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      // A stub that fails the way an unreachable database fails. The HTTP
      // contract is what this test is about, and taking the real database
      // down mid-suite would prove the same thing far more slowly.
      .overrideProvider(PrismaService)
      .useValue({
        $queryRaw: () => Promise.reject(new Error('connection refused')),
      })
      .compile();

    app = configureApp(moduleRef.createNestApplication());
    await app.init();
    server = app.getHttpServer() as Parameters<typeof request>[0];
  });

  afterAll(async () => {
    await app.close();
  });

  it('answers 503 and says which part is down', async () => {
    const response = await request(server).get('/health').expect(503);
    const body = response.body as HealthReport;

    expect(body.status).toBe('degraded');
    expect(body.database).toBe('down');
  });

  it('does not leak the connection error', async () => {
    const response = await request(server).get('/health');

    expect(JSON.stringify(response.body)).not.toContain('connection refused');
  });
});
