import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { SyncService } from './sync.service';
import { DiffDto } from './dto';
import { IsArray, IsString } from 'class-validator';

class DeleteDto {
  @IsString() deviceId!: string;
  @IsArray() deviceAssetIds!: string[];
}

@ApiBearerAuth()
@ApiTags('sync')
@UseGuards(JwtAuthGuard)
@Controller('sync')
export class SyncController {
  constructor(private readonly svc: SyncService) {}

  @Post('diff')
  diff(@CurrentUser() userId: string, @Body() dto: DiffDto) {
    return this.svc.diff(userId, dto);
  }

  @Post('delete')
  remove(@CurrentUser() userId: string, @Body() dto: DeleteDto) {
    return this.svc.deleteOnDevice(userId, dto.deviceId, dto.deviceAssetIds);
  }
}
