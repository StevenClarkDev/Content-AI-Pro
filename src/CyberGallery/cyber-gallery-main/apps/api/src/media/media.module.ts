import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ThumbnailProcessor } from './thumbnail.processor';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [StorageModule, BullModule.registerQueue({ name: 'media' })],
  providers: [ThumbnailProcessor],
})
export class MediaModule {}
