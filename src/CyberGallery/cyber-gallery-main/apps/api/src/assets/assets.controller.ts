import {
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AssetsService } from './assets.service';
import { MAX_IMAGE_BYTES } from '@cg/shared';

@ApiTags('assets')
@Controller('assets')
export class AssetsController {
  constructor(private readonly svc: AssetsService) {}

  // Upload endpoint uses upload token (not JWT). Body is raw image bytes
  // (application/octet-stream). Multipart parsing on Android RN is unreliable
  // (RNFS sends bogus boundary header), so we go raw.
  @Post(':id/upload')
  async upload(
    @Param('id') id: string,
    @Query('token') token: string,
    @Req() req: Request,
  ) {
    const buf = await new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      let total = 0;
      req.on('data', (c: Buffer) => {
        total += c.length;
        if (total > MAX_IMAGE_BYTES) {
          reject(new Error('PAYLOAD_TOO_LARGE'));
          req.destroy();
          return;
        }
        chunks.push(c);
      });
      req.on('end', () => resolve(Buffer.concat(chunks)));
      req.on('error', reject);
    });
    return this.svc.receiveUpload(id, token, buf);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get()
  list(
    @CurrentUser() userId: string,
    @Query('deviceId') deviceId?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.svc.list(userId, {
      deviceId,
      cursor,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get(':id')
  get(@CurrentUser() userId: string, @Param('id') id: string) {
    return this.svc.getOne(userId, id);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  remove(@CurrentUser() userId: string, @Param('id') id: string) {
    return this.svc.delete(userId, id);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get(':id/file')
  async file(
    @CurrentUser() userId: string,
    @Param('id') id: string,
    @Query('kind') kind: 'original' | 'thumb' = 'thumb',
    @Res() res: Response,
  ) {
    const { stream, mime, filename } = await this.svc.streamFile(userId, id, kind);
    res.setHeader('Content-Type', mime);
    res.setHeader('Cache-Control', 'private, max-age=300');
    if (kind === 'original') {
      res.setHeader(
        'Content-Disposition',
        `inline; filename="${encodeURIComponent(filename)}"`,
      );
    }
    stream.pipe(res);
  }
}
