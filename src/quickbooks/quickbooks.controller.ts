import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiBody,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { QuickbooksService } from './quickbooks.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { CreateItemDto } from './dto/create-item.dto';
import { UpdateInvoiceDto, VoidInvoiceDto } from './dto/update-invoice.dto';
import { ExchangeCodeDto, RefreshTokenDto, SetTokenDto } from './dto/token-management.dto';
import { AuthTokenInterceptor } from './interceptors/auth-token.interceptor';
import {
  QuickBooksCustomer,
  QuickBooksInvoice,
  QuickBooksItem,
  QuickBooksPaginatedResponse
} from './interfaces/quickbooks.interfaces';

@ApiTags('QuickBooks')
@Controller('quickbooks')
@UseInterceptors(AuthTokenInterceptor)
export class QuickbooksController {
  constructor(private readonly quickbooksService: QuickbooksService) { }

  @Post('auth/refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Refresh access token',
    description: 'Refreshes the access token using a refresh token',
  })
  @ApiBody({ type: RefreshTokenDto })
  @ApiResponse({
    status: 200,
    description: 'Token refreshed successfully',
    schema: {
      type: 'object',
      properties: {
        access_token: { type: 'string' },
        QUICKBOOKS_REFRESH_TOKEN: { type: 'string' },
        expires_in: { type: 'number' },
        token_type: { type: 'string' },
        realmId: { type: 'string' },
      },
    },
  })
  async refreshToken(@Body() refreshTokenDto: RefreshTokenDto) {
    const tokenResponse = await this.quickbooksService.refreshAccessToken(
      refreshTokenDto.refresh_token,
    );
    return {
      ...tokenResponse,
      message: 'Token refreshed successfully. Store the new tokens securely.',
    };
  }

  @Post('auth/exchange-code')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Exchange authorization code for tokens (Production Ready)',
    description:
      'Directly exchange an authorization code for access and refresh tokens. ' +
      'Use this when you already have an authorization code from QuickBooks. ' +
      'This is the production-ready way to authenticate without going through the OAuth flow repeatedly.',
  })
  @ApiBody({ type: ExchangeCodeDto })
  @ApiResponse({
    status: 200,
    description: 'Tokens exchanged successfully',
    schema: {
      type: 'object',
      properties: {
        access_token: { type: 'string' },
        QUICKBOOKS_REFRESH_TOKEN: { type: 'string' },
        expires_in: { type: 'number' },
        token_type: { type: 'string' },
        realmId: { type: 'string' },
        message: { type: 'string' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid authorization code' })
  async exchangeCode(@Body() exchangeCodeDto: ExchangeCodeDto) {
    const tokenResponse = await this.quickbooksService.exchangeCodeForToken(
      exchangeCodeDto.code,
    );

    // If realmId is provided, use it; otherwise use from response
    const realmId = exchangeCodeDto.realmId || tokenResponse.realmId;
    this.quickbooksService.setAccessToken(
      tokenResponse.access_token,
      realmId,
      tokenResponse.refresh_token,
      tokenResponse.expires_in,
    );

    return {
      ...tokenResponse,
      realmId,
      message: 'Tokens exchanged successfully. Store these tokens securely in your database.',
    };
  }

  @Post('auth/set-tokens')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Manually set tokens (Production Ready)',
    description:
      'Manually set access token, refresh token, and realm ID if you already have them. ' +
      'Use this when you have stored tokens from a previous session. ' +
      'This allows you to skip the OAuth flow if you already have valid tokens.',
  })
  @ApiBody({ type: SetTokenDto })
  @ApiResponse({
    status: 200,
    description: 'Tokens set successfully',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string' },
        status: {
          type: 'object',
          properties: {
            isAuthenticated: { type: 'boolean' },
            realmId: { type: 'string' },
            hasRefreshToken: { type: 'boolean' },
          },
        },
      },
    },
  })
  async setTokens(@Body() setTokenDto: SetTokenDto) {
    this.quickbooksService.setAccessToken(
      setTokenDto.access_token,
      setTokenDto.realmId,
      setTokenDto.refresh_token,
    );

    const status = this.quickbooksService.getTokenStatus();
    return {
      message: 'Tokens set successfully. You can now make API calls.',
      status,
    };
  }

  @Get('auth/status')
  @ApiOperation({
    summary: 'Get current authentication status',
    description:
      'Returns the current token status including whether tokens are set, ' +
      'realm ID, and expiration information.',
  })
  @ApiResponse({
    status: 200,
    description: 'Token status retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        isAuthenticated: { type: 'boolean' },
        realmId: { type: 'string', nullable: true },
        tokenExpiresAt: { type: 'string', nullable: true, format: 'date-time' },
        hasRefreshToken: { type: 'boolean' },
        isExpired: { type: 'boolean' },
      },
    },
  })
  getTokenStatus() {
    const status = this.quickbooksService.getTokenStatus();
    return {
      ...status,
      isExpired: this.quickbooksService.isTokenExpired(),
    };
  }

  @Get('company')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Get company information',
    description: 'Retrieves information about the connected QuickBooks company',
  })
  @ApiResponse({
    status: 200,
    description: 'Company information retrieved successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid or missing token' })
  async getCompanyInfo() {
    return this.quickbooksService.getCompanyInfo();
  }

  @Get('accounts')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Get all accounts',
    description:
      'Retrieves a list of accounts from QuickBooks. ' +
      'Use this to find IncomeAccountRef, ExpenseAccountRef, and AssetAccountRef values when creating items.',
  })
  @ApiQuery({
    name: 'maxResults',
    description: 'Maximum number of results to return',
    required: false,
    type: Number,
    example: 100,
  })
  @ApiQuery({
    name: 'startPosition',
    description: 'Starting position for pagination',
    required: false,
    type: Number,
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Accounts retrieved successfully',
  })
  async getAccounts(
    @Query('maxResults') maxResults?: number,
    @Query('startPosition') startPosition?: number,
  ) {
    return this.quickbooksService.getAccounts(
      maxResults || 100,
      startPosition || 1,
    );
  }

  @Get('accounts/income')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Get income accounts',
    description:
      'Retrieves only income accounts. ' +
      'Use the Id field from these accounts as IncomeAccountRef.value when creating Service or NonInventory items.',
  })
  @ApiResponse({
    status: 200,
    description: 'Income accounts retrieved successfully',
  })
  async getIncomeAccounts() {
    return this.quickbooksService.getIncomeAccounts();
  }

  @Get('customers')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Get all customers',
    description: 'Retrieves a list of customers from QuickBooks',
  })
  @ApiQuery({
    name: 'maxResults',
    description: 'Maximum number of results to return',
    required: false,
    type: Number,
    example: 20,
  })
  @ApiQuery({
    name: 'startPosition',
    description: 'Starting position for pagination',
    required: false,
    type: Number,
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Customers retrieved successfully',
  })
  async getCustomers(
    @Query('maxResults') maxResults?: number,
    @Query('startPosition') startPosition?: number,
  ) {
    return this.quickbooksService.getCustomers(
      maxResults || 20,
      startPosition || 1,
    );
  }

  @Get('customers/:id')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Get customer by ID',
    description: 'Retrieves a specific customer by their QuickBooks ID',
  })
  @ApiParam({
    name: 'id',
    description: 'QuickBooks customer ID',
    example: '1',
  })
  @ApiResponse({
    status: 200,
    description: 'Customer retrieved successfully',
  })
  @ApiResponse({ status: 404, description: 'Customer not found' })
  async getCustomerById(@Param('id') id: string) {
    return this.quickbooksService.getCustomerById(id);
  }

  @Post('customers')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Create a new customer',
    description: 'Creates a new customer in QuickBooks',
  })
  @ApiBody({ type: CreateCustomerDto })
  @ApiResponse({
    status: 201,
    description: 'Customer created successfully',
  })
  @ApiResponse({ status: 400, description: 'Invalid customer data' })
  async createCustomer(@Body() createCustomerDto: CreateCustomerDto): Promise<QuickBooksCustomer> {
    return this.quickbooksService.createCustomer(createCustomerDto as QuickBooksCustomer);
  }

  @Post('customers/:id')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Update a customer',
    description: 'Updates an existing customer in QuickBooks',
  })
  @ApiParam({
    name: 'id',
    description: 'QuickBooks customer ID',
    example: '1',
  })
  @ApiBody({ type: CreateCustomerDto })
  @ApiResponse({
    status: 200,
    description: 'Customer updated successfully',
  })
  async updateCustomer(
    @Param('id') id: string,
    @Body() updateCustomerDto: CreateCustomerDto,
  ): Promise<QuickBooksCustomer> {
    return this.quickbooksService.updateCustomer(id, updateCustomerDto as QuickBooksCustomer);
  }

  @Get('invoices')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Get all invoices',
    description: 'Retrieves a list of invoices from QuickBooks',
  })
  @ApiQuery({
    name: 'maxResults',
    description: 'Maximum number of results to return',
    required: false,
    type: Number,
    example: 20,
  })
  @ApiQuery({
    name: 'startPosition',
    description: 'Starting position for pagination',
    required: false,
    type: Number,
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Invoices retrieved successfully',
  })
  async getInvoices(
    @Query('maxResults') maxResults?: number,
    @Query('startPosition') startPosition?: number,
  ) {
    return this.quickbooksService.getInvoices(
      maxResults || 20,
      startPosition || 1,
    );
  }

  @Get('invoices/:id')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Get invoice by ID',
    description: 'Retrieves a specific invoice by its QuickBooks ID',
  })
  @ApiParam({
    name: 'id',
    description: 'QuickBooks invoice ID',
    example: '1',
  })
  @ApiResponse({
    status: 200,
    description: 'Invoice retrieved successfully',
  })
  @ApiResponse({ status: 404, description: 'Invoice not found' })
  async getInvoiceById(@Param('id') id: string) {
    return this.quickbooksService.getInvoiceById(id);
  }

  @Post('invoices')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Create a new invoice',
    description: 'Creates a new invoice in QuickBooks',
  })
  @ApiBody({ type: CreateInvoiceDto })
  @ApiResponse({
    status: 201,
    description: 'Invoice created successfully',
  })
  @ApiResponse({ status: 400, description: 'Invalid invoice data' })
  async createInvoice(@Body() createInvoiceDto: CreateInvoiceDto): Promise<QuickBooksInvoice> {
    return this.quickbooksService.createInvoice(createInvoiceDto as QuickBooksInvoice);
  }

  @Post('invoices/:id/void')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Void an invoice',
    description: 'Voids an existing invoice in QuickBooks. This sets the invoice amount to zero but keeps the record.',
  })
  @ApiParam({
    name: 'id',
    description: 'QuickBooks invoice ID',
    example: '1',
  })
  @ApiBody({ type: VoidInvoiceDto })
  @ApiResponse({
    status: 200,
    description: 'Invoice voided successfully',
  })
  async voidInvoice(
    @Param('id') id: string,
    @Body() voidInvoiceDto: VoidInvoiceDto,
  ): Promise<QuickBooksInvoice> {
    return this.quickbooksService.voidInvoice(id, voidInvoiceDto.SyncToken);
  }

  @Post('invoices/:id')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Update an invoice',
    description: 'Updates an existing invoice in QuickBooks. Use sparse=true (default) to only update provided fields.',
  })
  @ApiParam({
    name: 'id',
    description: 'QuickBooks invoice ID',
    example: '1',
  })
  @ApiBody({ type: UpdateInvoiceDto })
  @ApiResponse({
    status: 200,
    description: 'Invoice updated successfully',
  })
  async updateInvoice(
    @Param('id') id: string,
    @Body() updateInvoiceDto: UpdateInvoiceDto,
  ): Promise<QuickBooksInvoice> {
    return this.quickbooksService.updateInvoice(id, updateInvoiceDto as unknown as QuickBooksInvoice);
  }

  @Get('items')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Get all items',
    description: 'Retrieves a list of items (products/services) from QuickBooks',
  })
  @ApiQuery({
    name: 'maxResults',
    description: 'Maximum number of results to return',
    required: false,
    type: Number,
    example: 20,
  })
  @ApiQuery({
    name: 'startPosition',
    description: 'Starting position for pagination',
    required: false,
    type: Number,
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Items retrieved successfully',
  })
  async getItems(
    @Query('maxResults') maxResults?: number,
    @Query('startPosition') startPosition?: number,
  ) {
    return this.quickbooksService.getItems(
      maxResults || 20,
      startPosition || 1,
    );
  }

  @Get('items/:id')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Get item by ID',
    description: 'Retrieves a specific item by its QuickBooks ID',
  })
  @ApiParam({
    name: 'id',
    description: 'QuickBooks item ID',
    example: '1',
  })
  @ApiResponse({
    status: 200,
    description: 'Item retrieved successfully',
  })
  @ApiResponse({ status: 404, description: 'Item not found' })
  async getItemById(@Param('id') id: string) {
    return this.quickbooksService.getItemById(id);
  }

  @Post('items')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Create a new item',
    description: 'Creates a new item (product/service) in QuickBooks. ' +
      'You can provide account references by either account ID (value) or account name. ' +
      'If account name is provided, the system will automatically search for the account and create it if not found.',
  })
  @ApiBody({ type: CreateItemDto })
  @ApiResponse({
    status: 201,
    description: 'Item created successfully',
  })
  @ApiResponse({ status: 400, description: 'Invalid item data' })
  async createItem(@Body() createItemDto: CreateItemDto): Promise<QuickBooksItem> {
    return this.quickbooksService.createItem(createItemDto as unknown as QuickBooksItem);
  }
}

