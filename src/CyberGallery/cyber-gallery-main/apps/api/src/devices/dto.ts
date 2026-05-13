import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterDeviceDto {
  @IsString() @MinLength(1) @MaxLength(128) deviceUid!: string;
  @IsIn(['android', 'ios']) platform!: 'android' | 'ios';
  @IsString() @MinLength(1) @MaxLength(128) name!: string;
}
