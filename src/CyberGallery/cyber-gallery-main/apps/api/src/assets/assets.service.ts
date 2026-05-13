import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as path from 'path';
import * as crypto from 'crypto';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Asset } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LocalStorageService } from '../storage/local-storage.service';
import { AssetDto, ALLOWED_IMAGE_MIME, MAX_IMAGE_BYTES } from '@cg/shared';

@Injectable()
export class AssetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: LocalStorageService,
    @InjectQueue('media') private readonly mediaQueue: Queue,
  ) {}

  private extFromMime(mime: string) {
    switch (mime) {
      case 'image/jpeg': return '.jpg';
      case 'image/png':  return '.png';
      case 'image/webp': return '.webp';
      case 'image/heic': return '.heic';
      case 'image/heif': return '.heif';
      default: return '';
    }
  }

  async receiveUpload(
    assetId: string,
    token: string,
    body: Buffer,
  ) {
    if (!body || body.length === 0) {
      throw new BadRequestException('Empty upload body');
    }
    const asset = await this.prisma.asset.findUnique({ where: { id: assetId } });
    if (!asset || asset.uploadToken !== token) {
      throw new ForbiddenException('Invalid upload token');
    }
    const mime = asset.mimeType;
    if (!ALLOWED_IMAGE_MIME.includes(mime as any)) {
      throw new BadRequestException('Unsupported mime type');
    }
    if (body.length > MAX_IMAGE_BYTES) {
      throw new BadRequestException('File too large');
    }

    // Re-check quota at upload time (defense in depth)
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: asset.userId },
      select: { storageUsed: true },
    });
    if (Number(user.storageUsed) + body.length > 5 * 1024 * 1024 * 1024) {
      throw new ForbiddenException('Storage quota exceeded');
    }

    // verify checksum
    const checksum = crypto.createHash('sha256').update(body).digest('hex');
    if (checksum !== asset.checksum) {
      throw new BadRequestException('Checksum mismatch');
    }

    const key = this.storage.originalKey(
      asset.userId,
      asset.id,
      this.extFromMime(mime),
    );
    await this.storage.writeBuffer(key, body);

    const updated = await this.prisma.$transaction(async (tx) => {
      const a = await tx.asset.update({
        where: { id: asset.id },
        data: {
          status: 'uploaded',
          storageKey: key,
          sizeBytes: BigInt(body.length),
          uploadedAt: new Date(),
          uploadToken: null,
        },
      });
      // increment quota
      await tx.user.update({
        where: { id: asset.userId },
        data: { storageUsed: { increment: BigInt(body.length) } },
      });
      return a;
    });

    await this.mediaQueue.add(
      'thumbnail',
      { assetId: updated.id },
      { attempts: 3, backoff: { type: 'exponential', delay: 5000 }, removeOnComplete: true },
    );

    return { ok: true };
  }

  async list(
    userId: string,
    opts: { deviceId?: string; cursor?: string; limit?: number },
  ) {
    const limit = Math.min(Math.max(opts.limit ?? 60, 1), 200);
    const items = await this.prisma.asset.findMany({
      where: {
        userId,
        deviceId: opts.deviceId,
        status: 'uploaded',
        deletedAt: null,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    });
    const hasMore = items.length > limit;
    const slice = hasMore ? items.slice(0, limit) : items;
    return {
      items: slice.map((a) => this.toDto(a)),
      nextCursor: hasMore ? slice[slice.length - 1].id : null,
    };
  }

  async getOne(userId: string, id: string) {
    const a = await this.prisma.asset.findFirst({ where: { id, userId } });
    if (!a) throw new NotFoundException();
    return this.toDto(a);
  }

  async delete(userId: string, id: string) {
    const a = await this.prisma.asset.findFirst({ where: { id, userId } });
    if (!a) throw new NotFoundException();
    await this.prisma.$transaction(async (tx) => {
      await tx.asset.update({
        where: { id: a.id },
        data: { status: 'deleted', deletedAt: new Date() },
      });
      if (a.status === 'uploaded') {
        await tx.user.update({
          where: { id: userId },
          data: { storageUsed: { decrement: a.sizeBytes } },
        });
      }
    });
    if (a.storageKey) await this.storage.remove(a.storageKey);
    if (a.thumbnailKey) await this.storage.remove(a.thumbnailKey);
    return { ok: true };
  }

  async streamFile(userId: string, id: string, kind: 'original' | 'thumb') {
    const a = await this.prisma.asset.findFirst({ where: { id, userId } });
    if (!a) throw new NotFoundException();
    const key = kind === 'thumb' ? a.thumbnailKey : a.storageKey;
    if (!key || !(await this.storage.exists(key))) {
      throw new NotFoundException('File not available');
    }
    return { stream: this.storage.read(key), mime: kind === 'thumb' ? 'image/webp' : a.mimeType, filename: a.filename };
  }

  private toDto(a: Asset): AssetDto {
    return {
      id: a.id,
      deviceId: a.deviceId,
      deviceAssetId: a.deviceAssetId,
      filename: a.filename,
      mimeType: a.mimeType,
      sizeBytes: Number(a.sizeBytes),
      width: a.width,
      height: a.height,
      takenAt: a.takenAt?.toISOString() ?? null,
      status: a.status,
      uploadedAt: a.uploadedAt?.toISOString() ?? null,
      thumbnailUrl: a.thumbnailKey ? `/api/assets/${a.id}/file?kind=thumb` : null,
      originalUrl: a.storageKey ? `/api/assets/${a.id}/file?kind=original` : null,
    };
  }
}
