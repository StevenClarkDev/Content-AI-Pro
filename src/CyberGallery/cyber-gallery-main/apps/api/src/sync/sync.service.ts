import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { DiffDto } from './dto';
import {
  DiffResponse,
  DiffResultEntry,
  QUOTA_BYTES_PER_USER,
  MAX_IMAGE_BYTES,
} from '@cg/shared';

@Injectable()
export class SyncService {
  constructor(private readonly prisma: PrismaService) {}

  async diff(userId: string, dto: DiffDto): Promise<DiffResponse> {
    const device = await this.prisma.device.findFirst({
      where: { id: dto.deviceId, userId },
    });
    if (!device) throw new NotFoundException('Device not found');

    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { storageUsed: true },
    });
    let quotaUsed = Number(user.storageUsed);

    const ids = dto.items.map((i) => i.deviceAssetId);
    const existing = await this.prisma.asset.findMany({
      where: {
        userId,
        deviceId: device.id,
        deviceAssetId: { in: ids },
        deletedAt: null,
      },
      select: {
        deviceAssetId: true,
        checksum: true,
        status: true,
        id: true,
        uploadToken: true,
      },
    });
    const existingMap = new Map(existing.map((e) => [e.deviceAssetId, e]));

    const upToDate: string[] = [];
    const toUpload: DiffResultEntry[] = [];

    for (const item of dto.items) {
      if (item.sizeBytes > MAX_IMAGE_BYTES) continue;
      const hit = existingMap.get(item.deviceAssetId);
      if (hit && hit.status === 'uploaded' && hit.checksum === item.checksum) {
        upToDate.push(item.deviceAssetId);
        continue;
      }
      // quota guard (estimate)
      if (quotaUsed + item.sizeBytes > QUOTA_BYTES_PER_USER) {
        throw new ForbiddenException('Storage quota exceeded');
      }
      quotaUsed += item.sizeBytes;

      const uploadToken = crypto.randomBytes(24).toString('hex');
      const asset = await this.prisma.asset.upsert({
        where: {
          userId_deviceId_deviceAssetId: {
            userId,
            deviceId: device.id,
            deviceAssetId: item.deviceAssetId,
          },
        },
        update: {
          checksum: item.checksum,
          filename: item.filename,
          mimeType: item.mimeType,
          sizeBytes: BigInt(item.sizeBytes),
          width: item.width,
          height: item.height,
          takenAt: item.takenAt ? new Date(item.takenAt) : null,
          modifiedAtDevice: item.modifiedAt ? new Date(item.modifiedAt) : null,
          status: 'pending',
          uploadToken,
          deletedAt: null,
        },
        create: {
          userId,
          deviceId: device.id,
          deviceAssetId: item.deviceAssetId,
          checksum: item.checksum,
          filename: item.filename,
          mimeType: item.mimeType,
          sizeBytes: BigInt(item.sizeBytes),
          width: item.width,
          height: item.height,
          takenAt: item.takenAt ? new Date(item.takenAt) : null,
          modifiedAtDevice: item.modifiedAt ? new Date(item.modifiedAt) : null,
          status: 'pending',
          uploadToken,
        },
      });
      toUpload.push({
        deviceAssetId: item.deviceAssetId,
        assetId: asset.id,
        uploadUrl: `/api/assets/${asset.id}/upload`,
        uploadToken,
      });
    }

    await this.prisma.device.update({
      where: { id: device.id },
      data: { lastSyncAt: new Date() },
    });

    return {
      toUpload,
      upToDate,
      quotaUsedBytes: Number(user.storageUsed),
      quotaTotalBytes: QUOTA_BYTES_PER_USER,
    };
  }

  async deleteOnDevice(userId: string, deviceId: string, deviceAssetIds: string[]) {
    const assets = await this.prisma.asset.findMany({
      where: { userId, deviceId, deviceAssetId: { in: deviceAssetIds } },
    });
    for (const a of assets) {
      await this.prisma.asset.update({
        where: { id: a.id },
        data: { status: 'deleted', deletedAt: new Date() },
      });
    }
    return { deleted: assets.length };
  }
}
