import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ALLOWED_IMAGE_MIME } from '@cg/shared';

export class DiffItemDto {
  @IsString() deviceAssetId!: string;
  @IsString() checksum!: string;
  @IsString() filename!: string;
  @IsIn(ALLOWED_IMAGE_MIME as readonly string[]) mimeType!: string;
  @IsInt() @Min(1) sizeBytes!: number;
  @IsOptional() @IsInt() width?: number;
  @IsOptional() @IsInt() height?: number;
  @IsOptional() @IsString() takenAt?: string;
  @IsOptional() @IsString() modifiedAt?: string;
}

export class DiffDto {
  @IsString() deviceId!: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => DiffItemDto)
  items!: DiffItemDto[];
}
