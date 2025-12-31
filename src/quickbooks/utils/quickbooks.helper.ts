import { HttpException, HttpStatus, Logger } from '@nestjs/common';

export class QuickBooksHelper {
    private static readonly logger = new Logger(QuickBooksHelper.name);

    /**
     * Formats a QuickBooks query string
     */
    static formatQuery(entity: string, maxResults: number, startPosition: number, where?: string): string {
        let query = `SELECT * FROM ${entity}`;
        if (where) {
            query += ` WHERE ${where}`;
        }
        query += ` MAXRESULTS ${maxResults} STARTPOSITION ${startPosition}`;
        return query;
    }

    /**
     * Formats a QuickBooks count query string
     */
    static formatCountQuery(entity: string, where?: string): string {
        let query = `SELECT COUNT(*) FROM ${entity}`;
        if (where) {
            query += ` WHERE ${where}`;
        }
        return query;
    }

    /**
     * Handles QuickBooks API errors consistently
     */
    static handleApiError(error: any, context: string): never {
        const responseData = error.response?.data || error.response || {};
        this.logger.error(`${context} error: ${JSON.stringify(responseData)}`);

        // Handle both uppercase and lowercase keys from QuickBooks API
        const fault = responseData.Fault || responseData.fault;
        const errorList = fault?.Error || fault?.error;
        const errorDetail = errorList?.[0];

        const errorMessage = errorDetail?.Detail ||
            errorDetail?.detail ||
            errorDetail?.Message ||
            errorDetail?.message ||
            `Failed to ${context.toLowerCase()}`;

        const statusCode = error.response?.status || error.status || HttpStatus.BAD_REQUEST;

        throw new HttpException(
            {
                message: errorMessage,
                code: errorDetail?.code,
                detail: errorDetail?.Detail || errorDetail?.detail,
                originalError: responseData,
            },
            statusCode,
        );
    }

    /**
     * Escapes single quotes for QuickBooks queries
     */
    static escapeQueryValue(value: string): string {
        return value.replace(/'/g, "''");
    }

    /**
     * Formats customer request body for QuickBooks API
     */
    static formatCustomerRequestBody(customerData: any): any {
        const requestBody: any = {
            DisplayName: customerData.DisplayName,
        };

        if (customerData.PrimaryEmailAddr) {
            requestBody.PrimaryEmailAddr = {
                Address: typeof customerData.PrimaryEmailAddr === 'string'
                    ? customerData.PrimaryEmailAddr
                    : customerData.PrimaryEmailAddr.Address,
            };
        }

        if (customerData.PrimaryPhone) {
            requestBody.PrimaryPhone = {
                FreeFormNumber: typeof customerData.PrimaryPhone === 'string'
                    ? customerData.PrimaryPhone
                    : customerData.PrimaryPhone.FreeFormNumber,
            };
        }

        if (customerData.BillAddr) {
            requestBody.BillAddr = customerData.BillAddr;
        }

        if (customerData.Notes) {
            requestBody.Notes = customerData.Notes;
        }

        return requestBody;
    }

    /**
     * Formats item request body for QuickBooks API
     */
    static formatItemRequestBody(itemData: any, incomeAccountRef?: any, expenseAccountRef?: any, assetAccountRef?: any): any {
        const requestBody: any = {
            Name: itemData.Name,
            Type: itemData.Type,
            ...(itemData.UnitPrice !== undefined && { UnitPrice: itemData.UnitPrice }),
            ...(itemData.Description && { Description: itemData.Description }),
            ...(itemData.Sku && { Sku: itemData.Sku }),
        };

        if (incomeAccountRef) {
            requestBody.IncomeAccountRef = incomeAccountRef;
        }

        if (itemData.Type === 'Inventory') {
            if (expenseAccountRef) requestBody.ExpenseAccountRef = expenseAccountRef;
            if (assetAccountRef) requestBody.AssetAccountRef = assetAccountRef;
            requestBody.TrackQtyOnHand = true;
            requestBody.QtyOnHand = itemData.QtyOnHand || 0;
            requestBody.InvStartDate = itemData.InvStartDate || new Date().toISOString().split('T')[0];
        }

        return requestBody;
    }

    /**
     * Formats invoice request body for QuickBooks API
     */
    static formatInvoiceRequestBody(invoiceData: any): any {
        return {
            CustomerRef: invoiceData.CustomerRef,
            Line: invoiceData.Line.map((line: any, index: number) => ({
                Amount: line.Amount,
                DetailType: line.DetailType || 'SalesItemLineDetail',
                ...(line.DetailType === 'SalesItemLineDetail' && line.SalesItemLineDetail && {
                    SalesItemLineDetail: {
                        ItemRef: line.SalesItemLineDetail.ItemRef,
                        ...(line.SalesItemLineDetail.Qty && { Qty: line.SalesItemLineDetail.Qty }),
                        ...(line.SalesItemLineDetail.UnitPrice && { UnitPrice: line.SalesItemLineDetail.UnitPrice }),
                    },
                }),
                ...(line.Description && { Description: line.Description }),
                LineNum: line.LineNum || index + 1,
            })),
            ...(invoiceData.TxnDate && { TxnDate: invoiceData.TxnDate }),
            ...(invoiceData.DueDate && { DueDate: invoiceData.DueDate }),
            ...(invoiceData.DocNumber && { DocNumber: invoiceData.DocNumber }),
        };
    }
}
