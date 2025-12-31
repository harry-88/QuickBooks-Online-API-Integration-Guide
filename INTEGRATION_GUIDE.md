# QuickBooks Integration Step-by-Step Guide

This guide walks you through integrating QuickBooks API with your NestJS application.

## Step 1: QuickBooks Developer Account Setup

1. **Create an Intuit Developer Account**
   - Visit: https://developer.intuit.com/
   - Sign up or log in
   - Navigate to "My Apps"

2. **Create a New App**
   - Click "Create an app"
   - Select "QuickBooks Online" as the product
   - Fill in app details
   - Save your **Client ID** and **Client Secret**

3. **Configure OAuth Settings**
   - Go to your app's settings
   - Add redirect URI: `http://localhost:3000/quickbooks/auth/callback`
   - Select scopes:
     - `com.intuit.quickbooks.accounting` (required)
     - `com.intuit.quickbooks.payment` (optional)

## Step 2: Project Setup

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Configure Environment Variables**
   Create a `.env` file:
   ```env
   QUICKBOOKS_CLIENT_ID=your_client_id_here
   QUICKBOOKS_CLIENT_SECRET=your_client_secret_here
   QUICKBOOKS_REDIRECT_URI=http://localhost:3000/quickbooks/auth/callback
   QUICKBOOKS_ENVIRONMENT=sandbox
   PORT=3000
   ```

3. **Start the Server**
   ```bash
   npm run start:dev
   ```

## Step 3: OAuth Authentication Flow

### 3.1 Get Authorization URL

```bash
curl http://localhost:3000/quickbooks/auth/authorize
```

Response:
```json
{
  "authorizationUrl": "https://appcenter.intuit.com/connect/oauth2?...",
  "message": "Redirect user to this URL for authorization"
}
```

### 3.2 User Authorization

1. Open the `authorizationUrl` in a browser
2. Log in to QuickBooks
3. Grant permissions
4. QuickBooks redirects to your callback URL with `code` and `realmId`

### 3.3 Exchange Code for Token

The callback endpoint automatically exchanges the code for tokens. You'll receive:

```json
{
  "access_token": "eyJraWQiOiJ...",
  "QUICKBOOKS_REFRESH_TOKEN": "L011546037439...",
  "expires_in": 3600,
  "token_type": "bearer",
  "realmId": "123146096291789"
}
```

**Important:** Store these tokens securely in your database!

## Step 4: Making API Calls

### 4.1 Set Access Token

Before making API calls, you need to set the access token in the service:

```typescript
// In your service or controller
this.quickbooksService.setAccessToken(accessToken, realmId);
```

### 4.2 Example: Get Company Information

```bash
curl -X GET \
  http://localhost:3000/quickbooks/company \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### 4.3 Example: Create a Customer

```bash
curl -X POST \
  http://localhost:3000/quickbooks/customers \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "DisplayName": "John Doe",
    "PrimaryEmailAddr": {
      "Address": "john.doe@example.com"
    },
    "PrimaryPhone": {
      "FreeFormNumber": "+1-555-123-4567"
    },
    "BillAddr": {
      "Line1": "123 Main St",
      "City": "New York",
      "CountrySubDivisionCode": "NY",
      "PostalCode": "10001",
      "Country": "US"
    }
  }'
```

### 4.4 Example: Create an Invoice

```bash
curl -X POST \
  http://localhost:3000/quickbooks/invoices \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "CustomerRef": {
      "value": "1"
    },
    "Line": [
      {
        "LineNum": 1,
        "ItemRef": {
          "value": "1"
        },
        "Amount": 100.00,
        "Quantity": 1,
        "Description": "Consulting services"
      }
    ],
    "TxnDate": "2024-01-15"
  }'
```

### 4.5 Example: Create an Item

```bash
curl -X POST \
  http://localhost:3000/quickbooks/items \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "Name": "Consulting Service",
    "Type": "Service",
    "UnitPrice": 150.00,
    "Description": "Professional consulting services",
    "Sku": "CONSULT-001"
  }'
```

## Step 5: Token Refresh

Access tokens expire after 1 hour. Refresh them using:

```bash
curl -X POST \
  http://localhost:3000/quickbooks/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{
    "QUICKBOOKS_REFRESH_TOKEN": "YOUR_QUICKBOOKS_REFRESH_TOKEN"
  }'
```

## Step 6: Using Swagger UI

1. Start the server
2. Navigate to: http://localhost:3000/api
3. Click "Authorize" button
4. Enter your access token
5. Test endpoints directly from Swagger UI

## Common Integration Patterns

### Pattern 1: Store Tokens in Database

```typescript
// Example: Store tokens after OAuth callback
async handleCallback(code: string, realmId: string) {
  const tokens = await this.quickbooksService.exchangeCodeForToken(code);
  
  // Store in database
  await this.tokenRepository.save({
    userId: currentUser.id,
    accessToken: tokens.access_token,
    refreshToken: tokens.QUICKBOOKS_REFRESH_TOKEN,
    realmId: tokens.realmId,
    expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
  });
  
  return tokens;
}
```

### Pattern 2: Auto-Refresh Tokens

```typescript
// Example: Middleware to refresh expired tokens
async ensureValidToken(userId: string) {
  const token = await this.tokenRepository.findOne({ userId });
  
  if (token.expiresAt < new Date()) {
    const refreshed = await this.quickbooksService.refreshAccessToken(token.refreshToken);
    token.accessToken = refreshed.access_token;
    token.expiresAt = new Date(Date.now() + refreshed.expires_in * 1000);
    await this.tokenRepository.save(token);
  }
  
  return token.accessToken;
}
```

### Pattern 3: Error Handling

```typescript
try {
  const customers = await this.quickbooksService.getCustomers();
  return customers;
} catch (error) {
  if (error.status === 401) {
    // Token expired, refresh it
    await this.refreshToken();
    // Retry the request
    return this.quickbooksService.getCustomers();
  }
  throw error;
}
```

## Testing in Sandbox

1. Use `QUICKBOOKS_ENVIRONMENT=sandbox` in `.env`
2. Create a sandbox company in QuickBooks
3. Test all operations without affecting real data
4. Switch to `production` when ready

## Production Checklist

- [ ] Use HTTPS for all endpoints
- [ ] Store tokens encrypted in database
- [ ] Implement token refresh before expiration
- [ ] Add rate limiting
- [ ] Implement proper error handling
- [ ] Add logging and monitoring
- [ ] Set up webhook handlers (if needed)
- [ ] Test thoroughly in sandbox
- [ ] Update redirect URI to production URL
- [ ] Switch `QUICKBOOKS_ENVIRONMENT` to `production`

## API Rate Limits

QuickBooks API has rate limits:
- **Sandbox:** 100 requests per minute
- **Production:** 500 requests per minute

Implement:
- Request queuing
- Exponential backoff retry
- Caching where appropriate

## Webhooks (Optional)

To receive real-time updates from QuickBooks:

1. Register webhook endpoints in QuickBooks app settings
2. Implement webhook verification
3. Handle webhook events (e.g., invoice created, payment received)

## Support Resources

- [QuickBooks API Documentation](https://developer.intuit.com/app/developer/qbo/docs/api/accounting/most-commonly-used/account)
- [OAuth 2.0 Guide](https://developer.intuit.com/app/developer/qbo/docs/develop/authentication-and-authorization)
- [Intuit Developer Forums](https://help.developer.intuit.com/)

---

**Next Steps:**
1. Complete OAuth flow
2. Test all endpoints in Swagger UI
3. Implement token storage
4. Add error handling
5. Deploy to production

