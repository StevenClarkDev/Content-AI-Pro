import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AssetsController } from './assets.controller';
import { AssetsService } from './assets.service';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [StorageModule, BullModule.registerQueue({ name: 'media' })],
  controllers: [AssetsController],
  providers: [AssetsService],
  exports: [AssetsService],
})
export class AssetsModule {}
