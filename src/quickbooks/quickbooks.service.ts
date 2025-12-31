import { Injectable, HttpException, HttpStatus, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import {
  QuickBooksAccount,
  QuickBooksCompanyInfo,
  QuickBooksCustomer,
  QuickBooksInvoice,
  QuickBooksItem,
  QuickBooksPaginatedResponse,
  QuickBooksQueryResponse,
  QuickBooksReference,
  QuickBooksTokenResponse
} from './interfaces/quickbooks.interfaces';
import { QuickBooksHelper } from './utils/quickbooks.helper';

export interface TokenStorage {
  access_token: string;
  refresh_token: string;
  realmId: string;
  expires_at?: Date;
  refresh_token_issued_at?: Date; // Track when refresh token was issued
}

@Injectable()
export class QuickbooksService implements OnModuleInit {
  private readonly logger = new Logger(QuickbooksService.name);
  private readonly axiosInstance: AxiosInstance;
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private realmId: string | null = null;
  private tokenExpiresAt: Date | null = null;
  private readonly baseUrl: string;

  constructor(private configService: ConfigService) {
    const environment = this.configService.get<string>('QUICKBOOKS_ENVIRONMENT', 'sandbox');
    this.baseUrl = environment === 'production'
      ? 'https://quickbooks.api.intuit.com'
      : 'https://sandbox-quickbooks.api.intuit.com';

    this.axiosInstance = axios.create({
      baseURL: this.baseUrl,
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
    });

    // Add request interceptor for authentication
    this.axiosInstance.interceptors.request.use((config) => {
      if (this.accessToken) {
        config.headers.Authorization = `Bearer ${this.accessToken}`;
      }
      return config;
    });

    // Initialize from environment if available
    this.refreshToken = this.configService.get<string>('QUICKBOOKS_REFRESH_TOKEN');
    this.realmId = this.configService.get<string>('QUICKBOOKS_REALM_ID');

    if (this.refreshToken && this.realmId) {
      this.logger.log(`Initialized with refresh token and realm ID: ${this.realmId}`);
    }
  }

  async onModuleInit() {
    if (this.refreshToken && this.realmId) {
      this.logger.log('Attempting automatic token refresh on startup...');
      try {
        await this.ensureValidToken();
        this.logger.log('Automatic token refresh successful');
      } catch (error) {
        this.logger.error('Failed to refresh token on startup. Manual authentication may be required.');
      }
    }
  }

  /**
   * Set the access token and realm ID for API calls
   */
  setAccessToken(accessToken: string, realmId: string, refreshToken?: string, expiresIn?: number): void {
    this.accessToken = accessToken;
    this.realmId = realmId;
    if (refreshToken) {
      this.refreshToken = refreshToken;
    }
    if (expiresIn) {
      this.tokenExpiresAt = new Date(Date.now() + expiresIn * 1000);
    }
    this.logger.log(`Access token set for realm: ${realmId}`);
  }

  /**
   * Get current token status
   */
  getTokenStatus(): {
    isAuthenticated: boolean;
    realmId: string | null;
    tokenExpiresAt: Date | null;
    hasRefreshToken: boolean;
  } {
    return {
      isAuthenticated: !!this.accessToken && !!this.realmId,
      realmId: this.realmId,
      tokenExpiresAt: this.tokenExpiresAt,
      hasRefreshToken: !!this.refreshToken,
    };
  }

  /**
   * Check if token is expired or about to expire (within 5 minutes)
   */
  isTokenExpired(): boolean {
    // If we have a refresh token but no access token, consider it expired to trigger refresh
    if (!this.accessToken && this.refreshToken) {
      return true;
    }

    if (!this.tokenExpiresAt) {
      return false; // No expiration info, assume valid
    }
    const fiveMinutesFromNow = new Date(Date.now() + 5 * 60 * 1000);
    return this.tokenExpiresAt <= fiveMinutesFromNow;
  }

  /**
   * Automatically refresh token if expired
   */
  async ensureValidToken(): Promise<void> {
    // If no refresh token is available, skip auto-refresh
    // The API call will proceed and fail naturally if token is expired
    if (!this.refreshToken) {
      if (this.isTokenExpired()) {
        this.logger.warn('Token expired but no refresh token available. API call may fail.');
      }
      return;
    }

    // Only attempt refresh if we have a refresh token and the token is expired
    if (this.isTokenExpired()) {
      this.logger.log('Token expired or about to expire, refreshing...');
      try {
        const tokenResponse = await this.refreshAccessToken(this.refreshToken);
        this.setAccessToken(
          tokenResponse.access_token,
          tokenResponse.realmId,
          tokenResponse.refresh_token,
          tokenResponse.expires_in,
        );
      } catch (error) {
        // If refresh fails, the refresh token might be expired
        if (error.status === 401 || error.status === 400) {
          this.logger.error('Refresh token expired or invalid. Re-authentication required.');
          throw new HttpException(
            'Refresh token expired or invalid. Please re-authenticate to get a new refresh token.',
            HttpStatus.UNAUTHORIZED,
          );
        }
        throw error;
      }
    }
  }

  /**
   * Check if refresh token is expired (QuickBooks refresh tokens expire after 5 years)
   * Note: This is a helper method. QuickBooks doesn't provide expiration info,
   * so you should track when the refresh token was issued in your database.
   */
  isRefreshTokenExpired(issuedAt?: Date): boolean {
    if (!issuedAt) {
      return false; // Can't determine without issue date
    }
    // QuickBooks refresh tokens expire after 5 years (as of Nov 2025)
    const fiveYearsFromIssue = new Date(issuedAt);
    fiveYearsFromIssue.setFullYear(fiveYearsFromIssue.getFullYear() + 5);
    return new Date() >= fiveYearsFromIssue;
  }

  /**
   * Get OAuth authorization URL
   */
  getAuthorizationUrl(state?: string): string {
    const clientId = this.configService.get<string>('QUICKBOOKS_CLIENT_ID');
    const redirectUri = this.configService.get<string>('QUICKBOOKS_REDIRECT_URI');
    const environment = this.configService.get<string>('QUICKBOOKS_ENVIRONMENT', 'sandbox');

    const baseAuthUrl = environment === 'production'
      ? 'https://appcenter.intuit.com/connect/oauth2'
      : 'https://appcenter.intuit.com/connect/oauth2';

    const scopes = [
      'com.intuit.quickbooks.accounting',
      'com.intuit.quickbooks.payment',
    ].join(' ');

    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      scope: scopes,
      redirect_uri: redirectUri,
      ...(state && { state }),
    });

    return `${baseAuthUrl}?${params.toString()}`;
  }

  /**
   * Exchange authorization code for access token
   */
  async exchangeCodeForToken(code: string): Promise<QuickBooksTokenResponse> {
    const clientId = this.configService.get<string>('QUICKBOOKS_CLIENT_ID');
    const clientSecret = this.configService.get<string>('QUICKBOOKS_CLIENT_SECRET');
    const redirectUri = this.configService.get<string>('QUICKBOOKS_REDIRECT_URI');

    // Token endpoint is the same for both sandbox and production
    const tokenUrl = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';

    try {
      const response = await axios.post(
        tokenUrl,
        new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirectUri,
        }),
        {
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
          },
        },
      );

      const tokenData = response.data;
      this.setAccessToken(
        tokenData.access_token,
        tokenData.realmId,
        tokenData.refresh_token,
        tokenData.expires_in,
      );

      return {
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_in: tokenData.expires_in,
        token_type: tokenData.token_type,
        realmId: tokenData.realmId,
      };
    } catch (error) {
      this.logger.error(`Token exchange error: ${JSON.stringify(error.response?.data)}`);
      throw new HttpException(
        'Failed to exchange authorization code for token',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken(refreshToken: string): Promise<QuickBooksTokenResponse> {
    const clientId = this.configService.get<string>('QUICKBOOKS_CLIENT_ID');
    const clientSecret = this.configService.get<string>('QUICKBOOKS_CLIENT_SECRET');

    // Token endpoint is the same for both sandbox and production
    const tokenUrl = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';

    try {
      const response = await axios.post(
        tokenUrl,
        new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
        }),
        {
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
          },
        },
      );

      const tokenData = response.data;
      const newRefreshToken = tokenData.refresh_token || refreshToken;
      this.setAccessToken(
        tokenData.access_token,
        tokenData.realmId || this.realmId || '',
        newRefreshToken,
        tokenData.expires_in,
      );

      return {
        access_token: tokenData.access_token,
        refresh_token: newRefreshToken,
        expires_in: tokenData.expires_in,
        token_type: tokenData.token_type,
        realmId: tokenData.realmId || this.realmId || '',
      };
    } catch (error) {
      console.log(error);
      this.logger.error(`Token refresh error: ${JSON.stringify(error.response?.data)}`);
      throw new HttpException(
        'Failed to refresh access token',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * Get company information
   */
  async getCompanyInfo(): Promise<QuickBooksCompanyInfo> {
    if (!this.realmId) {
      throw new HttpException('Realm ID not set. Please authenticate first.', HttpStatus.BAD_REQUEST);
    }

    const response = await this.makeRequest('get', `/v3/company/${this.realmId}/companyinfo/${this.realmId}`);
    return response.data.QueryResponse?.CompanyInfo?.[0] || response.data;
  }

  /**
   * Generic method to make an API request with automatic retry on 401
   */
  private async makeRequest(
    method: 'get' | 'post',
    url: string,
    data?: any,
    config?: any,
    isRetry: boolean = false,
  ): Promise<any> {
    await this.ensureValidToken();

    try {
      if (method === 'get') {
        return await this.axiosInstance.get(url, config);
      } else {
        return await this.axiosInstance.post(url, data, config);
      }
    } catch (error) {
      // If 401 Authentication error and not already a retry
      const statusCode = error.response?.status || error.status;
      const isAuthError = statusCode === 401 ||
        (error.response?.data?.Fault?.Error?.[0]?.code === '3200') ||
        (error.response?.data?.fault?.error?.[0]?.code === '3200');

      if (isAuthError && !isRetry && this.refreshToken) {
        this.logger.log('Request failed with 401, attempting token refresh and retry...');
        try {
          await this.refreshAccessToken(this.refreshToken);
          // Retry the request with isRetry = true
          return await this.makeRequest(method, url, data, config, true);
        } catch (refreshError) {
          this.logger.error('Token refresh failed during retry attempt');
          QuickBooksHelper.handleApiError(error, 'API Request (after failed refresh)');
        }
      }

      QuickBooksHelper.handleApiError(error, `API Request ${method.toUpperCase()} ${url}`);
    }
  }

  /**
   * Generic method to execute a QuickBooks query with pagination and total count
   */
  private async executeQuery<T>(
    entity: string,
    maxResults: number,
    startPosition: number,
    where?: string,
  ): Promise<QuickBooksPaginatedResponse<T>> {
    const query = QuickBooksHelper.formatQuery(entity, maxResults, startPosition, where);
    const response = await this.makeRequest('get', `/v3/company/${this.realmId}/query`, undefined, {
      params: { query },
    });

    const queryResponse = response.data.QueryResponse as QuickBooksQueryResponse<T>;
    const items = (queryResponse[entity] as T[]) || [];

    // Get total count
    let totalCount = 0;
    try {
      const countQuery = QuickBooksHelper.formatCountQuery(entity, where);
      const countResponse = await this.makeRequest('get', `/v3/company/${this.realmId}/query`, undefined, {
        params: { query: countQuery },
      });
      const countData = countResponse.data.QueryResponse;

      if (countData && countData.totalCount !== undefined) {
        totalCount = countData.totalCount;
      } else if (countData && countData[entity] && countData[entity][0]) {
        totalCount = parseInt(countData[entity][0].Count) || items.length;
      } else {
        totalCount = items.length;
      }
    } catch (error) {
      this.logger.warn(`Failed to get total count for ${entity}, using array length as fallback`);
      totalCount = items.length;
    }

    return {
      totalCount,
      startPosition,
      maxResults,
      items,
    };
  }

  /**
   * Get all accounts (for finding IncomeAccountRef, ExpenseAccountRef, etc.)
   */
  async getAccounts(maxResults: number = 100, startPosition: number = 1): Promise<QuickBooksPaginatedResponse<QuickBooksAccount> & { accounts: QuickBooksAccount[] }> {
    const result = await this.executeQuery<QuickBooksAccount>('Account', maxResults, startPosition);
    return {
      ...result,
      accounts: result.items,
    };
  }

  /**
   * Get income accounts (filtered for easier selection)
   */
  async getIncomeAccounts(): Promise<{ accounts: QuickBooksAccount[]; message: string }> {
    const result = await this.executeQuery<QuickBooksAccount>('Account', 100, 1, "AccountType = 'Income'");
    return {
      accounts: result.items,
      message: 'Use the Id field from these accounts as IncomeAccountRef.value when creating items',
    };
  }

  /**
   * Find or create an account by name
   * @param accountName Account name to search for
   * @param accountType Account type (Income, Expense, Asset, etc.)
   * @param accountSubType Account sub type (optional, e.g., 'SalesOfProductIncome', 'ServiceIncome')
   * @returns Account ID
   */
  async findOrCreateAccount(
    accountName: string,
    accountType: string,
    accountSubType?: string,
  ): Promise<string> {
    if (!this.realmId) {
      throw new HttpException('Realm ID not set. Please authenticate first.', HttpStatus.BAD_REQUEST);
    }

    await this.ensureValidToken();

    try {
      // Search for account by name (including inactive accounts)
      const searchResponse = await this.makeRequest('get', `/v3/company/${this.realmId}/query`, undefined, {
        params: {
          query: `SELECT * FROM Account WHERE Name = '${accountName.replace(/'/g, "''")}' AND Active IN (true, false)`,
        },
      });

      const queryResponse = searchResponse.data.QueryResponse;
      const accounts = queryResponse.Account || [];

      // If account exists, return its ID
      if (accounts.length > 0) {
        const account = accounts[0];
        this.logger.log(`Found existing account: ${accountName} (ID: ${account.Id})`);
        return account.Id;
      }

      // Account doesn't exist, create it
      this.logger.log(`Account not found, creating new account: ${accountName}`);

      const accountData: any = {
        Name: accountName,
        AccountType: accountType,
        Active: true,
      };

      // Add AccountSubType if provided
      if (accountSubType) {
        accountData.AccountSubType = accountSubType;
      }

      const createResponse = await this.makeRequest('post', `/v3/company/${this.realmId}/account`, accountData);

      const createdAccount = createResponse.data.Account;
      if (createdAccount && createdAccount.Id) {
        this.logger.log(`Created new account: ${accountName} (ID: ${createdAccount.Id})`);
        return createdAccount.Id;
      }

      throw new HttpException('Failed to create account', HttpStatus.INTERNAL_SERVER_ERROR);
    } catch (error) {
      this.logger.error(`Find or create account error: ${JSON.stringify(error.response?.data)}`);

      // If it's a duplicate name error, try to find the account again
      const errorDetail = error.response?.data?.Fault?.Error?.[0];
      if (errorDetail?.code === '6240' || errorDetail?.Message?.includes('Duplicate')) {
        this.logger.log('Duplicate account name detected, searching again...');
        const retryResponse = await this.makeRequest('get', `/v3/company/${this.realmId}/query`, undefined, {
          params: {
            query: `SELECT * FROM Account WHERE Name = '${accountName.replace(/'/g, "''")}' AND Active IN (true, false)`,
          },
        });
        const retryAccounts = retryResponse.data.QueryResponse?.Account || [];
        if (retryAccounts.length > 0) {
          return retryAccounts[0].Id;
        }
      }

      throw new HttpException(
        {
          message: `Failed to find or create account: ${accountName}`,
          detail: errorDetail?.Detail || errorDetail?.Message,
          originalError: error.response?.data,
        },
        error.response?.status || HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * Resolve account reference (by ID or name)
   * @param accountRef Account reference with either value (ID) or name
   * @param accountType Account type if creating new account (Income, Expense, Asset)
   * @param accountSubType Account sub type if creating new account
   * @returns Account reference object with value and name
   */
  async resolveAccountRef(
    accountRef: { value?: string; name?: string },
    accountType?: string,
    accountSubType?: string,
  ): Promise<{ value: string; name?: string }> {
    // If value (ID) is provided, use it directly
    if (accountRef.value) {
      return {
        value: accountRef.value,
        name: accountRef.name,
      };
    }

    // If only name is provided, find or create the account
    if (accountRef.name) {
      if (!accountType) {
        throw new HttpException(
          {
            message: 'Account type is required when providing account name without ID',
            hint: 'Provide accountType when using account name',
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      const accountId = await this.findOrCreateAccount(
        accountRef.name,
        accountType,
        accountSubType,
      );

      return {
        value: accountId,
        name: accountRef.name,
      };
    }

    throw new HttpException(
      'Either account value (ID) or name must be provided',
      HttpStatus.BAD_REQUEST,
    );
  }

  /**
   * Get all customers
   */
  async getCustomers(maxResults: number = 20, startPosition: number = 1): Promise<QuickBooksPaginatedResponse<QuickBooksCustomer> & { customers: QuickBooksCustomer[] }> {
    const result = await this.executeQuery<QuickBooksCustomer>('Customer', maxResults, startPosition);
    return {
      ...result,
      customers: result.items,
    };
  }

  /**
   * Get customer by ID
   */
  async getCustomerById(customerId: string): Promise<QuickBooksCustomer> {
    const result = await this.executeQuery<QuickBooksCustomer>('Customer', 1, 1, `Id = '${QuickBooksHelper.escapeQueryValue(customerId)}'`);
    if (result.items.length === 0) {
      throw new HttpException(`Customer with ID ${customerId} not found`, HttpStatus.NOT_FOUND);
    }
    return result.items[0];
  }

  /**
   * Create a new customer
   */
  async createCustomer(customerData: QuickBooksCustomer): Promise<QuickBooksCustomer> {
    const requestBody = this.formatCustomerRequestBody(customerData);
    this.logger.debug(`Creating customer with body: ${JSON.stringify(requestBody)}`);
    const response = await this.makeRequest('post', `/v3/company/${this.realmId}/customer`, requestBody);
    return response.data.Customer || response.data;
  }

  /**
   * Update a customer
   */
  async updateCustomer(customerId: string, customerData: QuickBooksCustomer): Promise<QuickBooksCustomer> {
    const requestBody = {
      ...customerData,
      Id: customerId,
      SyncToken: customerData.SyncToken || '0',
    };

    const response = await this.makeRequest('post', `/v3/company/${this.realmId}/customer`, requestBody);
    return response.data.Customer || response.data;
  }

  /**
   * Formats customer request body for QuickBooks API
   */
  private formatCustomerRequestBody(customerData: QuickBooksCustomer): any {
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
   * Get all invoices
   */
  async getInvoices(maxResults: number = 20, startPosition: number = 1): Promise<QuickBooksPaginatedResponse<QuickBooksInvoice> & { invoices: QuickBooksInvoice[] }> {
    const result = await this.executeQuery<QuickBooksInvoice>('Invoice', maxResults, startPosition);
    return {
      ...result,
      invoices: result.items,
    };
  }

  /**
   * Get invoice by ID
   */
  async getInvoiceById(invoiceId: string): Promise<QuickBooksInvoice> {
    const result = await this.executeQuery<QuickBooksInvoice>('Invoice', 1, 1, `Id = '${QuickBooksHelper.escapeQueryValue(invoiceId)}'`);
    if (result.items.length === 0) {
      throw new HttpException(`Invoice with ID ${invoiceId} not found`, HttpStatus.NOT_FOUND);
    }
    return result.items[0];
  }

  /**
   * Create a new invoice
   */
  async createInvoice(invoiceData: any): Promise<any> {
    if (!this.realmId) {
      throw new HttpException('Realm ID not set. Please authenticate first.', HttpStatus.BAD_REQUEST);
    }

    // QuickBooks API expects invoice data directly (NOT wrapped)
    // Format according to official documentation
    const requestBody: any = {
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

    this.logger.debug(`Creating invoice with body: ${JSON.stringify(requestBody)}`);
    const response = await this.makeRequest('post', `/v3/company/${this.realmId}/invoice`, requestBody);
    return response.data.Invoice || response.data;
  }

  /**
   * Get all items
   */
  async getItems(maxResults: number = 20, startPosition: number = 1): Promise<QuickBooksPaginatedResponse<QuickBooksItem>> {
    return this.executeQuery<QuickBooksItem>('Item', maxResults, startPosition);
  }

  /**
   * Get item by ID
   */
  async getItemById(itemId: string): Promise<QuickBooksItem> {
    const result = await this.executeQuery<QuickBooksItem>('Item', 1, 1, `Id = '${QuickBooksHelper.escapeQueryValue(itemId)}'`);
    if (result.items.length === 0) {
      throw new HttpException(`Item with ID ${itemId} not found`, HttpStatus.NOT_FOUND);
    }
    return result.items[0];
  }

  /**
   * Check if an item with the given name already exists
   */
  async findItemByName(itemName: string): Promise<QuickBooksItem | null> {
    const result = await this.executeQuery<QuickBooksItem>('Item', 1, 1, `Name = '${QuickBooksHelper.escapeQueryValue(itemName)}' AND Active IN (true, false)`);
    return result.items.length > 0 ? result.items[0] : null;
  }

  /**
   * Create a new item
   */
  async createItem(itemData: QuickBooksItem): Promise<QuickBooksItem> {
    // Check if item with same name already exists
    const existingItem = await this.findItemByName(itemData.Name);
    if (existingItem) {
      throw new HttpException(
        {
          message: `An item with the name "${itemData.Name}" already exists`,
          code: 'DUPLICATE_ITEM_NAME',
          existingItem: {
            Id: existingItem.Id,
            Name: existingItem.Name,
            Type: existingItem.Type,
          },
          hint: 'Item names must be unique in QuickBooks. Please use a different name or update the existing item.',
        },
        HttpStatus.CONFLICT,
      );
    }

    const requestBody = await this.formatItemRequestBody(itemData);
    this.logger.debug(`Creating item with body: ${JSON.stringify(requestBody)}`);
    const response = await this.makeRequest('post', `/v3/company/${this.realmId}/item`, requestBody);
    return response.data.Item || response.data;
  }

  /**
   * Formats item request body for QuickBooks API
   */
  private async formatItemRequestBody(itemData: QuickBooksItem): Promise<any> {
    const requestBody: any = {
      Name: itemData.Name,
      Type: itemData.Type,
      ...(itemData.UnitPrice !== undefined && { UnitPrice: itemData.UnitPrice }),
      ...(itemData.Description && { Description: itemData.Description }),
      ...(itemData.Sku && { Sku: itemData.Sku }),
    };

    if (itemData.Type === 'Service' || itemData.Type === 'NonInventory') {
      if (!itemData.IncomeAccountRef || (!itemData.IncomeAccountRef.value && !itemData.IncomeAccountRef.name)) {
        throw new HttpException('IncomeAccountRef is required for Service and NonInventory items', HttpStatus.BAD_REQUEST);
      }

      requestBody.IncomeAccountRef = await this.resolveAccountRef(
        itemData.IncomeAccountRef,
        'Income',
        itemData.Type === 'Service' ? 'ServiceIncome' : 'SalesOfProductIncome',
      );
    }

    if (itemData.Type === 'Inventory') {
      if (!itemData.IncomeAccountRef || !itemData.ExpenseAccountRef || !itemData.AssetAccountRef) {
        throw new HttpException('Income, Expense, and Asset account references are required for Inventory items', HttpStatus.BAD_REQUEST);
      }

      requestBody.IncomeAccountRef = await this.resolveAccountRef(itemData.IncomeAccountRef, 'Income', 'SalesOfProductIncome');
      requestBody.ExpenseAccountRef = await this.resolveAccountRef(itemData.ExpenseAccountRef, 'Cost of Goods Sold', 'SuppliesMaterialsCogs');
      requestBody.AssetAccountRef = await this.resolveAccountRef(itemData.AssetAccountRef, 'Asset', 'Inventory');
      requestBody.TrackQtyOnHand = true;
      requestBody.QtyOnHand = itemData.QtyOnHand || 0;
      requestBody.InvStartDate = itemData.InvStartDate || new Date().toISOString().split('T')[0];
    }

    return requestBody;
  }

  /**
   * Update an existing invoice
   */
  async updateInvoice(invoiceId: string, updateData: QuickBooksInvoice): Promise<QuickBooksInvoice> {
    const requestBody = {
      ...updateData,
      Id: invoiceId,
      SyncToken: updateData.SyncToken,
      sparse: updateData.sparse !== undefined ? updateData.sparse : true,
    };

    if (updateData.Line) {
      requestBody.Line = updateData.Line.map((line, index) => ({
        ...line,
        LineNum: line.LineNum || index + 1,
      }));
    }

    const response = await this.makeRequest('post', `/v3/company/${this.realmId}/invoice`, requestBody, {
      params: { operation: 'update' },
    });
    return response.data.Invoice || response.data;
  }

  /**
   * Void an existing invoice
   */
  async voidInvoice(invoiceId: string, syncToken: string): Promise<QuickBooksInvoice> {
    const requestBody = {
      Id: invoiceId,
      SyncToken: syncToken,
      sparse: true,
    };

    const response = await this.makeRequest('post', `/v3/company/${this.realmId}/invoice`, requestBody, {
      params: { operation: 'void' },
    });
    return response.data.Invoice || response.data;
  }
}

