import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNumber, IsOptional, IsEnum, ValidateNested, ValidateIf } from 'class-validator';
import { Type } from 'class-transformer';

export enum ItemType {
  Inventory = 'Inventory',
  Service = 'Service',
  NonInventory = 'NonInventory',
}

export class AccountRefDto {
  @ApiProperty({ 
    example: '79', 
    description: 'Account ID from QuickBooks. Either value OR name must be provided. ' +
      'If name is provided, the system will search for the account and create it if not found.', 
    required: false,
  })
  @ValidateIf((o) => !o.name)
  @IsString()
  value?: string;

  @ApiProperty({ 
    example: 'Sales of Product Income', 
    description: 'Account name. Either value OR name must be provided. ' +
      'If only name is provided, the system will search for the account by name and create it if not found.', 
    required: false 
  })
  @ValidateIf((o) => !o.value)
  @IsString()
  name?: string;
}

export class CreateItemDto {
  @ApiProperty({ example: 'Consulting Service', description: 'Item name' })
  @IsString()
  Name: string;

  @ApiProperty({ 
    enum: ItemType, 
    example: ItemType.Service,
    description: 'Type of item' 
  })
  @IsEnum(ItemType)
  Type: ItemType;

  @ApiProperty({ example: 150.00, description: 'Unit price', required: false })
  @IsOptional()
  @IsNumber()
  UnitPrice?: number;

  @ApiProperty({ example: 'Professional consulting services', required: false })
  @IsOptional()
  @IsString()
  Description?: string;

  @ApiProperty({ example: 'CONSULT', description: 'SKU or item code', required: false })
  @IsOptional()
  @IsString()
  Sku?: string;

  @ApiProperty({ 
    example: 0, 
    description: 'Initial quantity on hand - Only applicable for Inventory items. Defaults to 0 if not provided.', 
    required: false 
  })
  @IsOptional()
  @IsNumber()
  QtyOnHand?: number;

  @ApiProperty({ 
    example: '2024-01-15', 
    description: 'Inventory start date (YYYY-MM-DD) - Only applicable for Inventory items. ' +
      'Required when QtyOnHand is set. Defaults to today\'s date if not provided.', 
    required: false 
  })
  @IsOptional()
  @IsString()
  InvStartDate?: string;

  @ApiProperty({ 
    type: AccountRefDto,
    example: { name: 'Sales of Product Income' }, 
    description: 'Income account reference - REQUIRED for Service and NonInventory items. ' +
      'You can provide either value (account ID) or name. ' +
      'If name is provided, the system will search for the account and create it if not found. ' +
      'Example: { name: "Sales of Product Income" } or { value: "79", name: "Sales of Product Income" }',
    required: false,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => AccountRefDto)
  IncomeAccountRef?: AccountRefDto;

  @ApiProperty({ 
    type: AccountRefDto,
    example: { name: 'Cost of Goods Sold' }, 
    description: 'Expense account reference - REQUIRED for Inventory items. ' +
      'You can provide either value (account ID) or name. ' +
      'If name is provided, the system will search for the account and create it if not found. ' +
      'Not needed for Service or NonInventory items.',
    required: false,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => AccountRefDto)
  ExpenseAccountRef?: AccountRefDto;

  @ApiProperty({ 
    type: AccountRefDto,
    example: { name: 'Inventory Asset' }, 
    description: 'Asset account reference - REQUIRED for Inventory items. ' +
      'You can provide either value (account ID) or name. ' +
      'If name is provided, the system will search for the account and create it if not found. ' +
      'Not needed for Service or NonInventory items.',
    required: false,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => AccountRefDto)
  AssetAccountRef?: AccountRefDto;
}

