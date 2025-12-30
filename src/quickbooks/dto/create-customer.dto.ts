import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsEmail, IsOptional, IsObject } from 'class-validator';

export class AddressDto {
  @ApiProperty({ example: '123 Main St', required: false })
  @IsOptional()
  @IsString()
  Line1?: string;

  @ApiProperty({ example: 'Suite 100', required: false })
  @IsOptional()
  @IsString()
  Line2?: string;

  @ApiProperty({ example: 'New York', required: false })
  @IsOptional()
  @IsString()
  City?: string;

  @ApiProperty({ example: 'NY', required: false })
  @IsOptional()
  @IsString()
  CountrySubDivisionCode?: string;

  @ApiProperty({ example: '10001', required: false })
  @IsOptional()
  @IsString()
  PostalCode?: string;

  @ApiProperty({ example: 'US', required: false })
  @IsOptional()
  @IsString()
  Country?: string;
}

export class CreateCustomerDto {
  @ApiProperty({ example: 'John Doe', description: 'Customer display name' })
  @IsString()
  DisplayName: string;

  @ApiProperty({ example: 'john.doe@example.com', required: false })
  @IsOptional()
  @IsEmail()
  PrimaryEmailAddr?: {
    Address: string;
  };

  @ApiProperty({ example: '+1-555-123-4567', required: false })
  @IsOptional()
  @IsString()
  PrimaryPhone?: {
    FreeFormNumber: string;
  };

  @ApiProperty({ type: AddressDto, required: false })
  @IsOptional()
  @IsObject()
  BillAddr?: AddressDto;
}

