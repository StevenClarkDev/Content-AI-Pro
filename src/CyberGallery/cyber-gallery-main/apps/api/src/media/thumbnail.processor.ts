import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import sharp from 'sharp';
import { PrismaService } from '../prisma/prisma.service';
import { LocalStorageService } from '../storage/local-storage.service';

@Processor('media')
export class ThumbnailProcessor extends WorkerHost {
  private readonly logger = new Logger(ThumbnailProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: LocalStorageService,
  ) {
    super();
  }

  async process(job: Job<{ assetId: string }>) {
    if (job.name !== 'thumbnail') return;
    const { assetId } = job.data;
    const asset = await this.prisma.asset.findUnique({ where: { id: assetId } });
    if (!asset || !asset.storageKey) return;

    try {
      const inputBuf = await streamToBuffer(this.storage.read(asset.storageKey));
      const thumb = await sharp(inputBuf, { failOn: 'none' })
        .rotate()
        .resize(512, 512, { fit: 'inside' })
        .webp({ quality: 75 })
        .toBuffer();
      const thumbKey = this.storage.thumbKey(asset.userId, asset.id);
      await this.storage.writeBuffer(thumbKey, thumb);
      await this.prisma.asset.update({
        where: { id: asset.id },
        data: { thumbnailKey: thumbKey },
      });
    } catch (e: any) {
      this.logger.error(`thumbnail failed for ${assetId}: ${e.message}`);
      throw e;
    }
  }
}

function streamToBuffer(s: NodeJS.ReadableStream): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    s.on('data', (c) => chunks.push(c as Buffer));
    s.on('end', () => resolve(Buffer.concat(chunks)));
    s.on('error', reject);
  });
}
