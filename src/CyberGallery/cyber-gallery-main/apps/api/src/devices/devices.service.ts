import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDeviceDto } from './dto';

@Injectable()
export class DevicesService {
  constructor(private readonly prisma: PrismaService) {}

  upsert(userId: string, dto: RegisterDeviceDto) {
    return this.prisma.device.upsert({
      where: { userId_deviceUid: { userId, deviceUid: dto.deviceUid } },
      update: { name: dto.name, platform: dto.platform },
      create: { userId, ...dto },
    });
  }

  list(userId: string) {
    return this.prisma.device.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  touchSync(deviceId: string) {
    return this.prisma.device.update({
      where: { id: deviceId },
      data: { lastSyncAt: new Date() },
    });
  }
}
