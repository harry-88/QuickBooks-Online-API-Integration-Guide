import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsString, IsBoolean, IsOptional } from 'class-validator';
import { CreateInvoiceDto } from './create-invoice.dto';

export class UpdateInvoiceDto extends PartialType(CreateInvoiceDto) {
    @ApiProperty({
        example: '0',
        description: 'SyncToken from QuickBooks - required for updates to ensure concurrency control'
    })
    @IsString()
    SyncToken: string;

    @ApiProperty({
        example: true,
        description: 'If true, only the fields provided will be updated. If false, missing fields will be cleared.',
        required: false,
        default: true
    })
    @IsOptional()
    @IsBoolean()
    sparse?: boolean = true;

    @ApiProperty({
        example: 'EmailSent',
        description: 'Email status of the invoice',
        enum: ['NotSet', 'NeedToSend', 'EmailSent'],
        required: false
    })
    @IsOptional()
    @IsString()
    EmailStatus?: 'NotSet' | 'NeedToSend' | 'EmailSent';

    @ApiProperty({
        example: 'PrintComplete',
        description: 'Print status of the invoice',
        enum: ['NotSet', 'NeedToPrint', 'PrintComplete'],
        required: false
    })
    @IsOptional()
    @IsString()
    PrintStatus?: 'NotSet' | 'NeedToPrint' | 'PrintComplete';
}

export class VoidInvoiceDto {
    @ApiProperty({
        example: '0',
        description: 'SyncToken from QuickBooks - required for voiding to ensure concurrency control'
    })
    @IsString()
    SyncToken: string;
}
