import {
  Body,
  Controller,
  Get,
  type INestApplication,
  Module,
  Post,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Type } from 'class-transformer';
import { IsInt, IsString, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import request from 'supertest';
import { AppModule } from '../../app.module.js';
import { configureApp } from '../../app.setup.js';
import type { ProblemDetail } from './problem-detail.js';

/**
 * A fixture that exists only here: the format has to be provable before there
 * is a real endpoint with a body, and inventing a production route to test
 * the error format would leave that route in the API forever.
 */
class ProbeUnitDto {
  @IsString()
  @MaxLength(8)
  label!: string;
}

class ProbeDto {
  @IsString()
  title!: string;

  @IsInt()
  @Min(1)
  @Max(5)
  priority!: number;

  @ValidateNested()
  @Type(() => ProbeUnitDto)
  unit!: ProbeUnitDto;
}

@Controller('__probe')
class ProbeController {
  @Post()
  create(@Body() body: ProbeDto): ProbeDto {
    return body;
  }

  @Get('boom')
  boom(): never {
    throw new Error('connection string postgresql://secret@db/porter failed');
  }
}

@Module({ controllers: [ProbeController] })
class ProbeModule {}

describe('errors leave as problem+json', () => {
  let app: INestApplication;
  // getHttpServer() is typed any by Nest. Cast once here rather than at
  // every call, so the unsafe boundary is one line and has a name.
  // Derived from supertest's own signature: the 'supertest/types' subpath is
  // not exported under nodenext resolution.
  let server: Parameters<typeof request>[0];

  beforeAll(async () => {
    // .env.test arrives with the test database in step 5. Until then the api
    // needs the variable to exist, not to point anywhere real.
    process.env['DATABASE_URL'] ??= 'postgresql://probe@localhost:5432/probe';

    const moduleRef = await Test.createTestingModule({
      // The real AppModule through the real configureApp: the suite has to
      // exercise the app production runs, not one assembled for the test.
      imports: [AppModule, ProbeModule],
    }).compile();

    app = configureApp(moduleRef.createNestApplication());
    await app.init();
    server = app.getHttpServer() as Parameters<typeof request>[0];
  });

  afterAll(async () => {
    await app.close();
  });

  it('answers an unknown path with the problem content type', async () => {
    const response = await request(server).get('/nope').expect(404);
    const body = response.body as ProblemDetail;

    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(body.type).toBe('about:blank');
    expect(body.title).toBe('Not Found');
    expect(body.status).toBe(404);
    expect(body.instance).toBe('/nope');
  });

  it('reports every failed field with a dotted path', async () => {
    const response = await request(server)
      .post('/__probe')
      .send({ priority: 9, unit: { label: 'a label that is far too long' } })
      .expect(422);
    const body = response.body as ProblemDetail;

    expect(body.status).toBe(422);
    expect(body.detail).toBe('Request validation failed');

    const fields = (body.errors ?? []).map((error) => error.field);
    expect(fields).toContain('title');
    expect(fields).toContain('priority');
    expect(fields).toContain('unit.label');
  });

  it('rejects an unknown field instead of dropping it', async () => {
    const response = await request(server)
      .post('/__probe')
      .send({ title: 'leaking tap', priority: 2, unit: { label: '12B' }, nope: 'x' })
      .expect(422);
    const body = response.body as ProblemDetail;

    expect((body.errors ?? []).map((error) => error.field)).toContain('nope');
  });

  it('accepts a valid body', async () => {
    await request(server)
      .post('/__probe')
      .send({ title: 'leaking tap', priority: 2, unit: { label: '12B' } })
      .expect(201);
  });

  it('says nothing about an unexpected failure', async () => {
    const response = await request(server).get('/__probe/boom').expect(500);
    const body = response.body as ProblemDetail;

    expect(body.status).toBe(500);
    expect(body.detail).toBe('Unexpected error');
    // The message of the original error carried a connection string. Whatever
    // a handler throws, none of it may reach the caller.
    expect(JSON.stringify(body)).not.toContain('postgresql://');
    expect(JSON.stringify(body)).not.toContain('stack');
  });

  it('leaves successful responses alone', async () => {
    const response = await request(server).get('/health').expect(200);

    expect(response.headers['content-type']).toContain('application/json');
    expect(response.headers['content-type']).not.toContain('problem');
  });
});
