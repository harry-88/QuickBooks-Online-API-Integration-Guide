import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsNumber, IsOptional, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class LinkedTxnDto {
    @IsOptional()
    @IsString()
    TxnId?: string;

    @ApiProperty({
        example: 'Invoice',
        description: 'Type of the transaction to link to',
        enum: ['Invoice', 'CreditMemo', 'Bill'],
        required: false
    })
    @IsOptional()
    @IsString()
    TxnType?: string;
}

class PaymentLineDto {
    @ApiProperty({
        example: 100.00,
        description: 'Amount of the payment to apply to this line'
    })
    @IsNumber()
    Amount: number;

    @ApiProperty({
        type: [LinkedTxnDto],
        description: 'Transactions linked to this payment line'
    })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => LinkedTxnDto)
    LinkedTxn: LinkedTxnDto[];
}

export class CreatePaymentDto {
    @ApiProperty({
        example: 100.00,
        description: 'Total amount of the payment'
    })
    @IsNumber()
    TotalAmt: number;

    @ApiProperty({
        example: { value: '1' },
        description: 'Reference to the customer making the payment'
    })
    @IsNotEmpty()
    CustomerRef: { value: string; name?: string };

    @ApiProperty({
        type: [PaymentLineDto],
        description: 'Lines of the payment, linking to invoices or credit memos',
        required: false
    })
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => PaymentLineDto)
    Line?: PaymentLineDto[];

    @IsOptional()
    @IsString()
    PaymentRefNum?: string;

    @ApiProperty({
        example: { value: 'Stripe' },
        description: 'Reference to the payment method (e.g., Stripe, Cash, Check)',
        required: false
    })
    @IsOptional()
    PaymentMethodRef?: { value: string; name?: string };

    @ApiProperty({
        example: '2023-10-27',
        description: 'Date of the payment',
        required: false
    })
    @IsOptional()
    @IsString()
    TxnDate?: string;

    @ApiProperty({
        example: 'Payment for invoice #1',
        description: 'Private note for the payment',
        required: false
    })
    @IsOptional()
    @IsString()
    PrivateNote?: string;
}
