import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNumber, IsArray, IsOptional, ValidateNested, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';

export class ItemRefDto {
  @ApiProperty({ example: '1', description: 'Item ID from QuickBooks' })
  @IsString()
  value: string;

  @ApiProperty({ example: 'Services', description: 'Item name', required: false })
  @IsOptional()
  @IsString()
  name?: string;
}

export class SalesItemLineDetailDto {
  @ApiProperty({ type: ItemRefDto, description: 'Item reference' })
  @ValidateNested()
  @Type(() => ItemRefDto)
  ItemRef: ItemRefDto;

  @ApiProperty({ example: 1, description: 'Quantity', required: false })
  @IsOptional()
  @IsNumber()
  Qty?: number;

  @ApiProperty({ example: 100.00, description: 'Unit price', required: false })
  @IsOptional()
  @IsNumber()
  UnitPrice?: number;
}

export class LineItemDto {
  @ApiProperty({ example: 100.00, description: 'Line amount' })
  @IsNumber()
  Amount: number;

  @ApiProperty({ 
    example: 'SalesItemLineDetail', 
    description: 'Detail type - must be SalesItemLineDetail for item-based lines',
    enum: ['SalesItemLineDetail', 'SubTotalLineDetail', 'DiscountLineDetail'],
  })
  @IsEnum(['SalesItemLineDetail', 'SubTotalLineDetail', 'DiscountLineDetail'])
  DetailType: string;

  @ApiProperty({ 
    type: SalesItemLineDetailDto, 
    description: 'Sales item line detail (required when DetailType is SalesItemLineDetail)',
    required: false,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => SalesItemLineDetailDto)
  SalesItemLineDetail?: SalesItemLineDetailDto;

  @ApiProperty({ example: 'Service provided', required: false })
  @IsOptional()
  @IsString()
  Description?: string;

  @ApiProperty({ example: 1, description: 'Line number', required: false })
  @IsOptional()
  @IsNumber()
  LineNum?: number;
}

export class CustomerRefDto {
  @ApiProperty({ example: '1', description: 'Customer ID from QuickBooks' })
  @IsString()
  value: string;

  @ApiProperty({ example: 'Customer Name', description: 'Customer name', required: false })
  @IsOptional()
  @IsString()
  name?: string;
}

export class CreateInvoiceDto {
  @ApiProperty({ type: CustomerRefDto, description: 'Customer reference' })
  @ValidateNested()
  @Type(() => CustomerRefDto)
  CustomerRef: CustomerRefDto;

  @ApiProperty({ type: [LineItemDto], description: 'Invoice line items' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LineItemDto)
  Line: LineItemDto[];

  @ApiProperty({ example: '2024-01-15', description: 'Invoice date (YYYY-MM-DD)', required: false })
  @IsOptional()
  @IsString()
  TxnDate?: string;

  @ApiProperty({ example: '2024-02-15', description: 'Due date (YYYY-MM-DD)', required: false })
  @IsOptional()
  @IsString()
  DueDate?: string;

  @ApiProperty({ example: 'Invoice description', required: false })
  @IsOptional()
  @IsString()
  DocNumber?: string;
}

