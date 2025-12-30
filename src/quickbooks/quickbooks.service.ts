import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

export interface QuickBooksTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  realmId: string;
}

export interface QuickBooksCompanyInfo {
  CompanyName: string;
  LegalName: string;
  CompanyAddr: any;
  FiscalYearStartMonth: string;
  Country: string;
  Email: any;
  WebAddr: any;
  NameValue: any[];
}

export interface TokenStorage {
  access_token: string;
  refresh_token: string;
  realmId: string;
  expires_at?: Date;
  refresh_token_issued_at?: Date; // Track when refresh token was issued
}

@Injectable()
export class QuickbooksService {
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

    // Add response interceptor for error handling
    this.axiosInstance.interceptors.response.use(
      (response) => response,
      (error) => {
        this.logger.error(`QuickBooks API Error: ${JSON.stringify(error.response?.data)}`);
        throw new HttpException(
          error.response?.data?.fault?.error?.[0]?.message || 'QuickBooks API Error',
          error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR,
        );
      },
    );
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

    // Ensure token is valid before making API call
    await this.ensureValidToken();

    const response = await this.axiosInstance.get(`/v3/company/${this.realmId}/companyinfo/${this.realmId}`);
    return response.data.QueryResponse?.CompanyInfo?.[0] || response.data;
  }

  /**
   * Get all accounts (for finding IncomeAccountRef, ExpenseAccountRef, etc.)
   */
  async getAccounts(maxResults: number = 100, startPosition: number = 1): Promise<any> {
    if (!this.realmId) {
      throw new HttpException('Realm ID not set. Please authenticate first.', HttpStatus.BAD_REQUEST);
    }

    // Ensure token is valid before making API call
    await this.ensureValidToken();

    // Get accounts
    const response = await this.axiosInstance.get(
      `/v3/company/${this.realmId}/query`,
      {
        params: {
          query: `SELECT * FROM Account MAXRESULTS ${maxResults} STARTPOSITION ${startPosition}`,
        },
      },
    );

    const queryResponse = response.data.QueryResponse;
    const accounts = queryResponse.Account || [];

    // Get total count using COUNT query
    let totalCount = 0;
    try {
      const countResponse = await this.axiosInstance.get(
        `/v3/company/${this.realmId}/query`,
        {
          params: {
            query: `SELECT COUNT(*) FROM Account`,
          },
        },
      );
      const countData = countResponse.data.QueryResponse;
      if (countData && countData.totalCount !== undefined) {
        totalCount = countData.totalCount;
      } else if (countData && countData.Account && countData.Account[0]) {
        totalCount = parseInt(countData.Account[0].Count) || accounts.length;
      } else {
        totalCount = accounts.length;
      }
    } catch (error) {
      this.logger.warn('Failed to get total count, using array length as fallback');
      totalCount = accounts.length;
    }

    return {
      totalCount,
      startPosition,
      maxResults,
      accounts,
    };
  }

  /**
   * Get income accounts (filtered for easier selection)
   */
  async getIncomeAccounts(): Promise<any> {
    if (!this.realmId) {
      throw new HttpException('Realm ID not set. Please authenticate first.', HttpStatus.BAD_REQUEST);
    }

    // Ensure token is valid before making API call
    await this.ensureValidToken();

    try {
      // Query for income accounts
      const response = await this.axiosInstance.get(
        `/v3/company/${this.realmId}/query`,
        {
          params: {
            query: `SELECT * FROM Account WHERE AccountType = 'Income'`,
          },
        },
      );

      const queryResponse = response.data.QueryResponse;
      const accounts = queryResponse.Account || [];

      return {
        accounts,
        message: 'Use the Id field from these accounts as IncomeAccountRef.value when creating items',
      };
    } catch (error) {
      this.logger.error(`Get income accounts error: ${JSON.stringify(error.response?.data)}`);
      throw new HttpException(
        'Failed to get income accounts',
        error.response?.status || HttpStatus.BAD_REQUEST,
      );
    }
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
      const searchResponse = await this.axiosInstance.get(
        `/v3/company/${this.realmId}/query`,
        {
          params: {
            query: `SELECT * FROM Account WHERE Name = '${accountName.replace(/'/g, "''")}' AND Active IN (true, false)`,
          },
        },
      );

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

      const createResponse = await this.axiosInstance.post(
        `/v3/company/${this.realmId}/account`,
        accountData,
      );

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
        const retryResponse = await this.axiosInstance.get(
          `/v3/company/${this.realmId}/query`,
          {
            params: {
              query: `SELECT * FROM Account WHERE Name = '${accountName.replace(/'/g, "''")}' AND Active IN (true, false)`,
            },
          },
        );
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
  async getCustomers(maxResults: number = 20, startPosition: number = 1): Promise<any> {
    if (!this.realmId) {
      throw new HttpException('Realm ID not set. Please authenticate first.', HttpStatus.BAD_REQUEST);
    }

    // Ensure token is valid before making API call
    await this.ensureValidToken();

    // Get customers
    const response = await this.axiosInstance.get(
      `/v3/company/${this.realmId}/query`,
      {
        params: {
          query: `SELECT * FROM Customer MAXRESULTS ${maxResults} STARTPOSITION ${startPosition}`,
        },
      },
    );

    const queryResponse = response.data.QueryResponse;
    const customers = queryResponse.Customer || [];

    // Get total count using COUNT query
    let totalCount = 0;
    try {
      const countResponse = await this.axiosInstance.get(
        `/v3/company/${this.realmId}/query`,
        {
          params: {
            query: `SELECT COUNT(*) FROM Customer`,
          },
        },
      );
      const countData = countResponse.data.QueryResponse;
      // QuickBooks returns count in the first row
      if (countData && countData.totalCount !== undefined) {
        totalCount = countData.totalCount;
      } else if (countData && countData.Customer && countData.Customer[0]) {
        // Sometimes count is in the Customer array
        totalCount = parseInt(countData.Customer[0].Count) || customers.length;
      } else {
        // Fallback: use array length if count query fails
        totalCount = customers.length;
      }
    } catch (error) {
      // If count query fails, use array length as fallback
      this.logger.warn('Failed to get total count, using array length as fallback');
      totalCount = customers.length;
    }

    return {
      totalCount,
      startPosition,
      maxResults,
      customers,
    };
  }

  /**
   * Get customer by ID
   */
  async getCustomerById(customerId: string): Promise<any> {
    if (!this.realmId) {
      throw new HttpException('Realm ID not set. Please authenticate first.', HttpStatus.BAD_REQUEST);
    }

    // Ensure token is valid before making API call
    await this.ensureValidToken();

    try {
      // QuickBooks API doesn't support GET /customers/{id}
      // Must use QUERY endpoint with WHERE clause
      const response = await this.axiosInstance.get(
        `/v3/company/${this.realmId}/query`,
        {
          params: {
            query: `SELECT * FROM Customer WHERE Id = '${customerId}'`,
          },
        },
      );
      
      // QuickBooks API response structure for QUERY
      const queryResponse = response.data.QueryResponse;
      if (queryResponse?.Customer && queryResponse.Customer.length > 0) {
        return queryResponse.Customer[0];
      }
      
      throw new HttpException(
        `Customer with ID ${customerId} not found`,
        HttpStatus.NOT_FOUND,
      );
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      
      this.logger.error(`Get customer by ID error: ${JSON.stringify(error.response?.data)}`);
      const fault = error.response?.data?.Fault;
      const errorDetail = fault?.Error?.[0];
      const errorMessage = errorDetail?.Detail || errorDetail?.Message || 'Failed to get customer';
      
      throw new HttpException(
        {
          message: errorMessage,
          code: errorDetail?.code,
          detail: errorDetail?.Detail,
        },
        error.response?.status || HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * Create a new customer
   */
  async createCustomer(customerData: any): Promise<any> {
    if (!this.realmId) {
      throw new HttpException('Realm ID not set. Please authenticate first.', HttpStatus.BAD_REQUEST);
    }

    // Ensure token is valid before making API call
    await this.ensureValidToken();

    // QuickBooks API v3 expects customer data directly (NOT wrapped in Customer object)
    // Format according to official documentation
    const requestBody: any = {
      DisplayName: customerData.DisplayName,
    };

    // Add optional fields if provided
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

    try {
      this.logger.debug(`Creating customer with body: ${JSON.stringify(requestBody)}`);

      const response = await this.axiosInstance.post(
        `/v3/company/${this.realmId}/customer`,
        requestBody,
      );

      // QuickBooks API returns: { Customer: {...} } for create operations
      if (response.data.Customer) {
        return response.data.Customer;
      }
      
      // Fallback formats
      if (response.data.QueryResponse?.Customer?.[0]) {
        return response.data.QueryResponse.Customer[0];
      }
      
      return response.data;
    } catch (error) {
      this.logger.error(`Create customer error: ${JSON.stringify(error.response?.data)}`);
      this.logger.error(`Request body sent: ${JSON.stringify(requestBody)}`);
      
      const fault = error.response?.data?.Fault;
      const errorDetail = fault?.Error?.[0];
      const errorMessage = errorDetail?.Detail || errorDetail?.Message || 'Failed to create customer';
      
      throw new HttpException(
        {
          message: errorMessage,
          code: errorDetail?.code,
          detail: errorDetail?.Detail,
          originalError: error.response?.data,
        },
        error.response?.status || HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * Update a customer
   */
  async updateCustomer(customerId: string, customerData: any): Promise<any> {
    if (!this.realmId) {
      throw new HttpException('Realm ID not set. Please authenticate first.', HttpStatus.BAD_REQUEST);
    }

    // Ensure token is valid before making API call
    await this.ensureValidToken();

    try {
      // QuickBooks API expects customer data directly (NOT wrapped)
      const requestBody: any = {
        ...customerData,
        Id: customerId,
        SyncToken: customerData.SyncToken || '0',
      };

      const response = await this.axiosInstance.post(
        `/v3/company/${this.realmId}/customer`,
        requestBody,
      );

      // QuickBooks API returns: { Customer: {...} } for update operations
      if (response.data.Customer) {
        return response.data.Customer;
      }
      
      if (response.data.QueryResponse?.Customer?.[0]) {
        return response.data.QueryResponse.Customer[0];
      }
      
      return response.data;
    } catch (error) {
      this.logger.error(`Update customer error: ${JSON.stringify(error.response?.data)}`);
      const errorMessage = error.response?.data?.Fault?.Error?.[0]?.Message || 
                          error.response?.data?.Fault?.Error?.[0]?.Detail ||
                          'Failed to update customer';
      throw new HttpException(
        errorMessage,
        error.response?.status || HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * Get all invoices
   */
  async getInvoices(maxResults: number = 20, startPosition: number = 1): Promise<any> {
    if (!this.realmId) {
      throw new HttpException('Realm ID not set. Please authenticate first.', HttpStatus.BAD_REQUEST);
    }

    // Ensure token is valid before making API call
    await this.ensureValidToken();

    // Get invoices
    const response = await this.axiosInstance.get(
      `/v3/company/${this.realmId}/query`,
      {
        params: {
          query: `SELECT * FROM Invoice MAXRESULTS ${maxResults} STARTPOSITION ${startPosition}`,
        },
      },
    );

    const queryResponse = response.data.QueryResponse;
    const invoices = queryResponse.Invoice || [];

    // Get total count using COUNT query
    let totalCount = 0;
    try {
      const countResponse = await this.axiosInstance.get(
        `/v3/company/${this.realmId}/query`,
        {
          params: {
            query: `SELECT COUNT(*) FROM Invoice`,
          },
        },
      );
      const countData = countResponse.data.QueryResponse;
      if (countData && countData.totalCount !== undefined) {
        totalCount = countData.totalCount;
      } else if (countData && countData.Invoice && countData.Invoice[0]) {
        totalCount = parseInt(countData.Invoice[0].Count) || invoices.length;
      } else {
        totalCount = invoices.length;
      }
    } catch (error) {
      this.logger.warn('Failed to get total count, using array length as fallback');
      totalCount = invoices.length;
    }

    return {
      totalCount,
      startPosition,
      maxResults,
      invoices,
    };
  }

  /**
   * Get invoice by ID
   */
  async getInvoiceById(invoiceId: string): Promise<any> {
    if (!this.realmId) {
      throw new HttpException('Realm ID not set. Please authenticate first.', HttpStatus.BAD_REQUEST);
    }

    // Ensure token is valid before making API call
    await this.ensureValidToken();

    try {
      // QuickBooks API doesn't support GET /invoices/{id}
      // Must use QUERY endpoint with WHERE clause
      const response = await this.axiosInstance.get(
        `/v3/company/${this.realmId}/query`,
        {
          params: {
            query: `SELECT * FROM Invoice WHERE Id = '${invoiceId}'`,
          },
        },
      );
      
      // QuickBooks API response structure for QUERY
      const queryResponse = response.data.QueryResponse;
      if (queryResponse?.Invoice && queryResponse.Invoice.length > 0) {
        return queryResponse.Invoice[0];
      }
      
      throw new HttpException(
        `Invoice with ID ${invoiceId} not found`,
        HttpStatus.NOT_FOUND,
      );
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      
      this.logger.error(`Get invoice by ID error: ${JSON.stringify(error.response?.data)}`);
      const fault = error.response?.data?.Fault;
      const errorDetail = fault?.Error?.[0];
      const errorMessage = errorDetail?.Detail || errorDetail?.Message || 'Failed to get invoice';
      
      throw new HttpException(
        {
          message: errorMessage,
          code: errorDetail?.code,
          detail: errorDetail?.Detail,
        },
        error.response?.status || HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * Create a new invoice
   */
  async createInvoice(invoiceData: any): Promise<any> {
    if (!this.realmId) {
      throw new HttpException('Realm ID not set. Please authenticate first.', HttpStatus.BAD_REQUEST);
    }

    // Ensure token is valid before making API call
    await this.ensureValidToken();

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

    try {
      this.logger.debug(`Creating invoice with body: ${JSON.stringify(requestBody)}`);

      const response = await this.axiosInstance.post(
        `/v3/company/${this.realmId}/invoice`,
        requestBody,
      );

      // QuickBooks API returns: { Invoice: {...} } for create operations
      if (response.data.Invoice) {
        return response.data.Invoice;
      }
      
      if (response.data.QueryResponse?.Invoice?.[0]) {
        return response.data.QueryResponse.Invoice[0];
      }
      
      return response.data;
    } catch (error) {
      this.logger.error(`Create invoice error: ${JSON.stringify(error.response?.data)}`);
      this.logger.error(`Request body sent: ${JSON.stringify(requestBody)}`);
      
      const fault = error.response?.data?.Fault;
      const errorDetail = fault?.Error?.[0];
      const errorMessage = errorDetail?.Detail || errorDetail?.Message || 'Failed to create invoice';
      
      throw new HttpException(
        {
          message: errorMessage,
          code: errorDetail?.code,
          detail: errorDetail?.Detail,
          originalError: error.response?.data,
        },
        error.response?.status || HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * Get all items
   */
  async getItems(maxResults: number = 20, startPosition: number = 1): Promise<any> {
    if (!this.realmId) {
      throw new HttpException('Realm ID not set. Please authenticate first.', HttpStatus.BAD_REQUEST);
    }

    // Ensure token is valid before making API call
    await this.ensureValidToken();

    // Get items
    const response = await this.axiosInstance.get(
      `/v3/company/${this.realmId}/query`,
      {
        params: {
          query: `SELECT * FROM Item MAXRESULTS ${maxResults} STARTPOSITION ${startPosition}`,
        },
      },
    );

    const queryResponse = response.data.QueryResponse;
    const items = queryResponse.Item || [];

    // Get total count using COUNT query
    let totalCount = 0;
    try {
      const countResponse = await this.axiosInstance.get(
        `/v3/company/${this.realmId}/query`,
        {
          params: {
            query: `SELECT COUNT(*) FROM Item`,
          },
        },
      );
      const countData = countResponse.data.QueryResponse;
      if (countData && countData.totalCount !== undefined) {
        totalCount = countData.totalCount;
      } else if (countData && countData.Item && countData.Item[0]) {
        totalCount = parseInt(countData.Item[0].Count) || items.length;
      } else {
        totalCount = items.length;
      }
    } catch (error) {
      this.logger.warn('Failed to get total count, using array length as fallback');
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
   * Get item by ID
   */
  async getItemById(itemId: string): Promise<any> {
    if (!this.realmId) {
      throw new HttpException('Realm ID not set. Please authenticate first.', HttpStatus.BAD_REQUEST);
    }

    // Ensure token is valid before making API call
    await this.ensureValidToken();

    try {
      // QuickBooks API doesn't support GET /items/{id}
      // Must use QUERY endpoint with WHERE clause
      const response = await this.axiosInstance.get(
        `/v3/company/${this.realmId}/query`,
        {
          params: {
            query: `SELECT * FROM Item WHERE Id = '${itemId}'`,
          },
        },
      );
      
      // QuickBooks API response structure for QUERY
      const queryResponse = response.data.QueryResponse;
      if (queryResponse?.Item && queryResponse.Item.length > 0) {
        return queryResponse.Item[0];
      }
      
      throw new HttpException(
        `Item with ID ${itemId} not found`,
        HttpStatus.NOT_FOUND,
      );
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      
      this.logger.error(`Get item by ID error: ${JSON.stringify(error.response?.data)}`);
      const fault = error.response?.data?.Fault;
      const errorDetail = fault?.Error?.[0];
      const errorMessage = errorDetail?.Detail || errorDetail?.Message || 'Failed to get item';
      
      throw new HttpException(
        {
          message: errorMessage,
          code: errorDetail?.code,
          detail: errorDetail?.Detail,
        },
        error.response?.status || HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * Check if an item with the given name already exists
   */
  async findItemByName(itemName: string): Promise<any | null> {
    if (!this.realmId) {
      return null;
    }

    try {
      await this.ensureValidToken();
      
      // Search for item by name (including inactive items)
      const response = await this.axiosInstance.get(
        `/v3/company/${this.realmId}/query`,
        {
          params: {
            query: `SELECT * FROM Item WHERE Name = '${itemName.replace(/'/g, "''")}' AND Active IN (true, false)`,
          },
        },
      );

      const queryResponse = response.data.QueryResponse;
      const items = queryResponse.Item || [];
      
      if (items.length > 0) {
        return items[0];
      }
      
      return null;
    } catch (error) {
      this.logger.warn(`Error checking for existing item: ${itemName}`);
      return null;
    }
  }

  /**
   * Create a new item
   */
  async createItem(itemData: any): Promise<any> {
    if (!this.realmId) {
      throw new HttpException('Realm ID not set. Please authenticate first.', HttpStatus.BAD_REQUEST);
    }

    // Ensure token is valid before making API call
    await this.ensureValidToken();

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

    // Validate and format request body according to item type
    const requestBody: any = {
      Name: itemData.Name,
      Type: itemData.Type,
      ...(itemData.UnitPrice !== undefined && { UnitPrice: itemData.UnitPrice }),
      ...(itemData.Description && { Description: itemData.Description }),
      ...(itemData.Sku && { Sku: itemData.Sku }),
    };

    // For Service and NonInventory items: IncomeAccountRef is REQUIRED
    if (itemData.Type === 'Service' || itemData.Type === 'NonInventory') {
      if (!itemData.IncomeAccountRef || (!itemData.IncomeAccountRef.value && !itemData.IncomeAccountRef.name)) {
        throw new HttpException(
          {
            message: 'IncomeAccountRef with either value (ID) or name is required for Service and NonInventory items',
            hint: 'Provide either account ID (value) or account name. If name is provided, account will be created if not found.',
          },
          HttpStatus.BAD_REQUEST,
        );
      }
      
      // Resolve account reference (by ID or name)
      const incomeAccountRef = await this.resolveAccountRef(
        itemData.IncomeAccountRef,
        'Income',
        itemData.Type === 'Service' ? 'ServiceIncome' : 'SalesOfProductIncome',
      );
      requestBody.IncomeAccountRef = incomeAccountRef;
      // Don't include ExpenseAccountRef or AssetAccountRef for Service/NonInventory items
    }

    // For Inventory items: IncomeAccountRef, ExpenseAccountRef, and AssetAccountRef are REQUIRED
    if (itemData.Type === 'Inventory') {
      if (!itemData.IncomeAccountRef || (!itemData.IncomeAccountRef.value && !itemData.IncomeAccountRef.name)) {
        throw new HttpException(
          {
            message: 'IncomeAccountRef with either value (ID) or name is required for Inventory items',
            hint: 'Provide either account ID (value) or account name. If name is provided, account will be created if not found.',
          },
          HttpStatus.BAD_REQUEST,
        );
      }
      if (!itemData.ExpenseAccountRef || (!itemData.ExpenseAccountRef.value && !itemData.ExpenseAccountRef.name)) {
        throw new HttpException(
          {
            message: 'ExpenseAccountRef with either value (ID) or name is required for Inventory items',
            hint: 'Provide either account ID (value) or account name. If name is provided, account will be created if not found.',
          },
          HttpStatus.BAD_REQUEST,
        );
      }
      if (!itemData.AssetAccountRef || (!itemData.AssetAccountRef.value && !itemData.AssetAccountRef.name)) {
        throw new HttpException(
          {
            message: 'AssetAccountRef with either value (ID) or name is required for Inventory items',
            hint: 'Provide either account ID (value) or account name. If name is provided, account will be created if not found.',
          },
          HttpStatus.BAD_REQUEST,
        );
      }
      
      // Resolve all account references (by ID or name)
      const incomeAccountRef = await this.resolveAccountRef(
        itemData.IncomeAccountRef,
        'Income',
        'SalesOfProductIncome',
      );
      const expenseAccountRef = await this.resolveAccountRef(
        itemData.ExpenseAccountRef,
        'Cost of Goods Sold',
        'SuppliesMaterialsCogs',
      );
      const assetAccountRef = await this.resolveAccountRef(
        itemData.AssetAccountRef,
        'Asset',
        'Inventory',
      );
      
      requestBody.IncomeAccountRef = incomeAccountRef;
      requestBody.ExpenseAccountRef = expenseAccountRef;
      requestBody.AssetAccountRef = assetAccountRef;
      
      // Inventory items require TrackQtyOnHand to be true
      requestBody.TrackQtyOnHand = true;
      
      // Optionally set initial quantity (default to 0 if not provided)
      if (itemData.QtyOnHand !== undefined) {
        requestBody.QtyOnHand = itemData.QtyOnHand;
        // InvStartDate is required when QtyOnHand is set
        // Use provided date or default to today's date
        if (itemData.InvStartDate) {
          requestBody.InvStartDate = itemData.InvStartDate;
        } else {
          // Format today's date as YYYY-MM-DD
          const today = new Date();
          requestBody.InvStartDate = today.toISOString().split('T')[0];
        }
      } else {
        requestBody.QtyOnHand = 0;
        // If QtyOnHand is 0, we still need InvStartDate for inventory tracking
        if (itemData.InvStartDate) {
          requestBody.InvStartDate = itemData.InvStartDate;
        } else {
          const today = new Date();
          requestBody.InvStartDate = today.toISOString().split('T')[0];
        }
      }
    }

    try {
      this.logger.debug(`Creating item with body: ${JSON.stringify(requestBody)}`);

      const response = await this.axiosInstance.post(
        `/v3/company/${this.realmId}/item`,
        requestBody,
      );

      // QuickBooks API returns: { Item: {...} } for create operations
      if (response.data.Item) {
        return response.data.Item;
      }
      
      if (response.data.QueryResponse?.Item?.[0]) {
        return response.data.QueryResponse.Item[0];
      }
      
      return response.data;
    } catch (error) {
      this.logger.error(`Create item error: ${JSON.stringify(error.response?.data)}`);
      this.logger.error(`Request body sent: ${JSON.stringify(requestBody)}`);
      
      const fault = error.response?.data?.Fault;
      const errorDetail = fault?.Error?.[0];
      
      // Handle duplicate name error specifically
      if (errorDetail?.code === '6240' || errorDetail?.Message?.includes('Duplicate Name')) {
        // Extract item ID from error message if available
        const idMatch = errorDetail?.Detail?.match(/Id=(\d+)/);
        const existingItemId = idMatch ? idMatch[1] : null;
        
        throw new HttpException(
          {
            message: `An item with the name "${itemData.Name}" already exists in QuickBooks`,
            code: 'DUPLICATE_ITEM_NAME',
            existingItemId: existingItemId,
            hint: 'Item names must be unique in QuickBooks. Please use a different name or update the existing item using PUT /quickbooks/items/:id',
            detail: errorDetail?.Detail,
          },
          HttpStatus.CONFLICT,
        );
      }
      
      // Handle inventory tracking error
      if (errorDetail?.code === '6000' && errorDetail?.Detail?.includes('Track quantity on hand')) {
        throw new HttpException(
          {
            message: 'Inventory items require quantity tracking to be enabled',
            code: 'INVENTORY_TRACKING_REQUIRED',
            detail: errorDetail?.Detail,
            hint: 'For Inventory items, TrackQtyOnHand must be true. This is automatically set when creating Inventory items.',
          },
          HttpStatus.BAD_REQUEST,
        );
      }
      
      const errorMessage = errorDetail?.Detail || errorDetail?.Message || 'Failed to create item';
      
      throw new HttpException(
        {
          message: errorMessage,
          code: errorDetail?.code,
          detail: errorDetail?.Detail,
          originalError: error.response?.data,
        },
        error.response?.status || HttpStatus.BAD_REQUEST,
      );
    }
  }
}

