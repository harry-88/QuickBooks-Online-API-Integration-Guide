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
}
