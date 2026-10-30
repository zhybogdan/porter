import { resolve } from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './config/env';
import { HealthModule } from './health/health.module';

/**
 * One .env for the whole repository: compose reads the same file, so the api
 * and the database cannot drift to different credentials.
 *
 * The path is anchored to this compiled file, not to the working directory.
 * A relative '../../.env' was correct only when the process started inside
 * apps/api. Started from the repository root, as docker or CI would, it
 * pointed one level above the repository, the file was silently not found,
 * and validation then blamed DATABASE_URL instead of the path.
 */
const repositoryRoot = resolve(__dirname, '..', '..', '..');

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [resolve(repositoryRoot, '.env')],
      // In production the platform injects real variables and no file exists.
      // Saying so explicitly beats relying on a missing file: a wrong path and
      // an absent one look identical otherwise.
      ignoreEnvFile: process.env.NODE_ENV === 'production',
      validate: validateEnv,
    }),
    HealthModule,
  ],
})
export class AppModule {}
