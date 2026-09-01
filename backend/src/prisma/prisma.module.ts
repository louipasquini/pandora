import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/** Acesso ao banco. Global — os contextos consomem sem reimportar. */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
