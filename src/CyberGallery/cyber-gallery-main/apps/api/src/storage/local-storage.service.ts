import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';

@Injectable()
export class LocalStorageService {
  private readonly logger = new Logger(LocalStorageService.name);
  readonly root = path.resolve(process.env.STORAGE_ROOT || './storage');

  constructor() {
    fs.mkdirSync(path.join(this.root, 'originals'), { recursive: true });
    fs.mkdirSync(path.join(this.root, 'thumbs'), { recursive: true });
  }

  originalKey(userId: string, assetId: string, ext: string) {
    return `originals/${userId}/${assetId}${ext}`;
  }

  thumbKey(userId: string, assetId: string) {
    return `thumbs/${userId}/${assetId}.webp`;
  }

  absolutePath(key: string) {
    const safe = path.normalize(key).replace(/^(\.\.[/\\])+/, '');
    return path.join(this.root, safe);
  }

  async writeStream(key: string, data: NodeJS.ReadableStream): Promise<number> {
    const abs = this.absolutePath(key);
    await fsp.mkdir(path.dirname(abs), { recursive: true });
    return new Promise((resolve, reject) => {
      const out = fs.createWriteStream(abs);
      let bytes = 0;
      data.on('data', (c: Buffer) => (bytes += c.length));
      data.pipe(out);
      out.on('finish', () => resolve(bytes));
      out.on('error', reject);
    });
  }

  async writeBuffer(key: string, buf: Buffer) {
    const abs = this.absolutePath(key);
    await fsp.mkdir(path.dirname(abs), { recursive: true });
    await fsp.writeFile(abs, buf);
  }

  async remove(key: string) {
    try {
      await fsp.unlink(this.absolutePath(key));
    } catch (e: any) {
      if (e.code !== 'ENOENT') this.logger.warn(`remove ${key}: ${e.message}`);
    }
  }

  async exists(key: string) {
    try {
      await fsp.access(this.absolutePath(key));
      return true;
    } catch {
      return false;
    }
  }

  async stat(key: string) {
    return fsp.stat(this.absolutePath(key));
  }

  read(key: string) {
    return fs.createReadStream(this.absolutePath(key));
  }
}
