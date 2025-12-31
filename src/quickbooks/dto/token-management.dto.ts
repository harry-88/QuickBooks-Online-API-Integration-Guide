import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class ExchangeCodeDto {
  @ApiProperty({
    example: 'L011546037439...',
    description: 'Authorization code from QuickBooks OAuth callback',
  })
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiProperty({
    example: '123146096291789',
    description: 'Realm ID (company ID) from QuickBooks',
    required: false,
  })
  @IsOptional()
  @IsString()
  realmId?: string;
}

export class RefreshTokenDto {
  @ApiProperty({
    example: 'L011546037439...',
    description: 'Refresh token to get new access token',
  })
  @IsString()
  @IsNotEmpty()
  QUICKBOOKS_REFRESH_TOKEN: string;
}

export class SetTokenDto {
  @ApiProperty({
    example: 'eyJraWQiOiJ...',
    description: 'Access token',
  })
  @IsString()
  @IsNotEmpty()
  access_token: string;

  @ApiProperty({
    example: '123146096291789',
    description: 'Realm ID (company ID)',
  })
  @IsString()
  @IsNotEmpty()
  realmId: string;

  @ApiProperty({
    example: 'L011546037439...',
    description: 'Refresh token (optional, but recommended)',
    required: false,
  })
  @IsOptional()
  @IsString()
  QUICKBOOKS_REFRESH_TOKEN?: string;
}

