# QuickBooks API Usage Examples

This document provides practical examples of how to use the QuickBooks integration API.

## Prerequisites

Before running these examples, ensure:
1. Server is running: `npm run start:dev`
2. You have completed OAuth authentication
3. You have a valid access token

## Authentication Examples

### Get Authorization URL

```bash
# Using curl
curl http://localhost:3000/quickbooks/auth/authorize

# Using JavaScript fetch
fetch('http://localhost:3000/quickbooks/auth/authorize')
  .then(res => res.json())
  .then(data => {
    console.log('Authorization URL:', data.authorizationUrl);
    // Redirect user to data.authorizationUrl
  });
```

### Handle OAuth Callback

After user authorizes, QuickBooks redirects to:
```
http://localhost:3000/quickbooks/auth/callback?code=xxx&realmId=xxx
```

The endpoint automatically exchanges the code for tokens.

### Refresh Access Token

```bash
curl -X POST http://localhost:3000/quickbooks/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{
    "refresh_token": "L011546037439..."
  }'
```

## Company Information

### Get Company Details

```bash
curl -X GET \
  http://localhost:3000/quickbooks/company \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

**Response:**
```json
{
  "CompanyName": "Acme Corporation",
  "LegalName": "Acme Corporation Inc.",
  "CompanyAddr": {
    "Line1": "123 Business St",
    "City": "San Francisco",
    "CountrySubDivisionCode": "CA",
    "PostalCode": "94105",
    "Country": "US"
  },
  "FiscalYearStartMonth": "January",
  "Country": "US"
}
```

## Customer Management

### Get All Customers

```bash
curl -X GET \
  "http://localhost:3000/quickbooks/customers?maxResults=10&startPosition=1" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Get Customer by ID

```bash
curl -X GET \
  http://localhost:3000/quickbooks/customers/1 \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Create a New Customer

```bash
curl -X POST \
  http://localhost:3000/quickbooks/customers \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "DisplayName": "Acme Corporation",
    "PrimaryEmailAddr": {
      "Address": "contact@acme.com"
    },
    "PrimaryPhone": {
      "FreeFormNumber": "+1-555-0100"
    },
    "BillAddr": {
      "Line1": "456 Corporate Blvd",
      "City": "New York",
      "CountrySubDivisionCode": "NY",
      "PostalCode": "10001",
      "Country": "US"
    }
  }'
```

**Response:**
```json
{
  "Id": "1",
  "DisplayName": "Acme Corporation",
  "PrimaryEmailAddr": {
    "Address": "contact@acme.com"
  },
  "SyncToken": "0",
  "sparse": false
}
```

### Update Customer

```bash
curl -X POST \
  http://localhost:3000/quickbooks/customers/1 \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "DisplayName": "Acme Corporation Updated",
    "PrimaryEmailAddr": {
      "Address": "newemail@acme.com"
    },
    "SyncToken": "0"
  }'
```

## Invoice Management

### Get All Invoices

```bash
curl -X GET \
  "http://localhost:3000/quickbooks/invoices?maxResults=20" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Get Invoice by ID

```bash
curl -X GET \
  http://localhost:3000/quickbooks/invoices/123 \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Create an Invoice

**Step 1: Get Customer ID**
```bash
# First, get customers to find the customer ID
curl -X GET \
  http://localhost:3000/quickbooks/customers \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

**Step 2: Get Item ID**
```bash
# Get items to find the item ID
curl -X GET \
  http://localhost:3000/quickbooks/items \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

**Step 3: Create Invoice**
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
        "Amount": 500.00,
        "Quantity": 1,
        "Description": "Monthly consulting services"
      },
      {
        "LineNum": 2,
        "ItemRef": {
          "value": "2"
        },
        "Amount": 200.00,
        "Quantity": 2,
        "Description": "Additional support hours"
      }
    ],
    "TxnDate": "2024-01-15",
    "DueDate": "2024-02-15"
  }'
```

**Response:**
```json
{
  "Id": "123",
  "DocNumber": "1001",
  "TxnDate": "2024-01-15",
  "DueDate": "2024-02-15",
  "TotalAmt": 700.00,
  "Balance": 700.00,
  "CustomerRef": {
    "value": "1",
    "name": "Acme Corporation"
  },
  "Line": [...]
}
```

## Item Management

### Get All Items

```bash
curl -X GET \
  "http://localhost:3000/quickbooks/items?maxResults=20" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Get Item by ID

```bash
curl -X GET \
  http://localhost:3000/quickbooks/items/1 \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Create a Service Item

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

### Create a Product Item

```bash
curl -X POST \
  http://localhost:3000/quickbooks/items \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "Name": "Premium Widget",
    "Type": "Inventory",
    "UnitPrice": 99.99,
    "Description": "High-quality widget",
    "Sku": "WIDGET-001"
  }'
```

## JavaScript/TypeScript Examples

### Using Fetch API

```typescript
// Get authorization URL
async function getAuthUrl() {
  const response = await fetch('http://localhost:3000/quickbooks/auth/authorize');
  const data = await response.json();
  return data.authorizationUrl;
}

// Get company info
async function getCompanyInfo(accessToken: string) {
  const response = await fetch('http://localhost:3000/quickbooks/company', {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  });
  return response.json();
}

// Create customer
async function createCustomer(accessToken: string, customerData: any) {
  const response = await fetch('http://localhost:3000/quickbooks/customers', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(customerData),
  });
  return response.json();
}

// Create invoice
async function createInvoice(accessToken: string, invoiceData: any) {
  const response = await fetch('http://localhost:3000/quickbooks/invoices', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(invoiceData),
  });
  return response.json();
}
```

### Using Axios

```typescript
import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:3000',
});

// Set default authorization header
api.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`;

// Get customers
const customers = await api.get('/quickbooks/customers', {
  params: { maxResults: 20, startPosition: 1 },
});

// Create customer
const newCustomer = await api.post('/quickbooks/customers', {
  DisplayName: 'New Customer',
  PrimaryEmailAddr: { Address: 'customer@example.com' },
});
```

## Error Handling Examples

### Handling API Errors

```typescript
try {
  const customers = await fetch('http://localhost:3000/quickbooks/customers', {
    headers: { 'Authorization': `Bearer ${accessToken}` },
  });
  
  if (!customers.ok) {
    if (customers.status === 401) {
      // Token expired, refresh it
      await refreshToken();
      // Retry request
    } else {
      throw new Error(`API Error: ${customers.status}`);
    }
  }
  
  return customers.json();
} catch (error) {
  console.error('Error fetching customers:', error);
  throw error;
}
```

### Retry Logic with Exponential Backoff

```typescript
async function retryRequest(fn, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000));
    }
  }
}
```

## Complete Workflow Example

```typescript
// Complete workflow: Create customer, item, and invoice
async function completeWorkflow(accessToken: string) {
  // 1. Create customer
  const customer = await createCustomer(accessToken, {
    DisplayName: 'New Customer Inc.',
    PrimaryEmailAddr: { Address: 'customer@example.com' },
  });
  
  console.log('Customer created:', customer.Id);
  
  // 2. Create item
  const item = await createItem(accessToken, {
    Name: 'Consulting Service',
    Type: 'Service',
    UnitPrice: 150.00,
  });
  
  console.log('Item created:', item.Id);
  
  // 3. Create invoice
  const invoice = await createInvoice(accessToken, {
    CustomerRef: { value: customer.Id },
    Line: [{
      LineNum: 1,
      ItemRef: { value: item.Id },
      Amount: 150.00,
      Quantity: 1,
    }],
    TxnDate: new Date().toISOString().split('T')[0],
  });
  
  console.log('Invoice created:', invoice.Id);
  return invoice;
}
```

## Testing with Swagger UI

1. Start the server: `npm run start:dev`
2. Open: http://localhost:3000/api
3. Click "Authorize" button
4. Enter your access token
5. Test endpoints directly from the UI

## Notes

- Replace `YOUR_ACCESS_TOKEN` with actual access token
- Access tokens expire after 1 hour
- Use refresh token to get new access tokens
- All dates should be in YYYY-MM-DD format
- Amounts are in the company's base currency
- Always handle errors appropriately
- Implement retry logic for production use

