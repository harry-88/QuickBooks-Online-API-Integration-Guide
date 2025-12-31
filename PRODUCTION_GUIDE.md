# QuickBooks Online API Production Implementation Guide 🏭

[![NestJS](https://img.shields.io/badge/framework-NestJS-E0234E.svg)](https://nestjs.com/)
[![QuickBooks](https://img.shields.io/badge/API-QuickBooks%20Online-2CA01C.svg)](https://developer.intuit.com/)
[![Security](https://img.shields.io/badge/Security-Production%20Ready-blue.svg)](https://developer.intuit.com/app/developer/qbo/docs/develop/authentication-and-authorization)

This guide provides a deep dive into the **production-ready** features of the QuickBooks integration. It focuses on secure token management, automated workflows, and robust authentication methods that bypass the need for repeated manual OAuth handshakes.

---

## 🎯 Production Authentication Methods

In a production environment, you need to handle tokens programmatically. This project provides specialized endpoints for these scenarios.

### 1. Direct Authorization Code Exchange
Exchange a one-time authorization code for a full set of tokens without manual redirection.

**Endpoint**: `POST /quickbooks/auth/exchange-code`

```json
{
  "code": "your_authorization_code_here",
  "realmId": "123146096291789"
}
```

**Response**:
```json
{
  "access_token": "eyJraWQiOiJ...",
  "QUICKBOOKS_REFRESH_TOKEN": "L011546037439...",
  "expires_in": 3600,
  "realmId": "123146096291789",
  "message": "Tokens exchanged successfully. Store these securely."
}
```

---

### 2. Manual Token Injection
If you already have tokens stored in your database, use this endpoint to initialize the service state.

**Endpoint**: `POST /quickbooks/auth/set-tokens`

```json
{
  "access_token": "eyJraWQiOiJ...",
  "realmId": "123146096291789",
  "QUICKBOOKS_REFRESH_TOKEN": "L011546037439..."
}
```

---

### 3. Automated Token Refresh
Access tokens expire every **60 minutes**. Use the refresh token to obtain a new pair.

**Endpoint**: `POST /quickbooks/auth/refresh`

```json
{
  "QUICKBOOKS_REFRESH_TOKEN": "L011546037439..."
}
```

---

## 🔄 Complete Production Workflow

### Phase 1: Initial Handshake (One-Time)
1. Redirect user to the authorization URL via `GET /quickbooks/auth/authorize`.
2. Capture the `code` and `realmId` from the callback.
3. Exchange the code for tokens and **store them encrypted** in your database.

### Phase 2: Daily Operations
1. **Initialize**: On application startup or user session start, call `set-tokens` with data from your DB.
2. **Pre-flight Check**: Before any API call, check `GET /quickbooks/auth/status`.
3. **Refresh**: If `isExpired` is true, call the `refresh` endpoint and update your database with the new tokens.
4. **Execute**: Proceed with standard API calls (Customers, Invoices, etc.).

---

## 🔐 Security & Best Practices

### 🗄️ Database Schema
We recommend the following schema for storing QuickBooks credentials:

```sql
CREATE TABLE qbo_connections (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL,
    access_token_encrypted TEXT NOT NULL,
    QUICKBOOKS_REFRESH_TOKEN_encrypted TEXT NOT NULL,
    realm_id VARCHAR(50) NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### �️ Encryption
> [!IMPORTANT]
> Never store tokens in plain text. Use AES-256 or a similar standard to encrypt tokens before saving to the database.

### 📉 Rate Limiting
QuickBooks Production API limits are **500 requests per minute**.
- Implement **Exponential Backoff** for 429 errors.
- Use a queuing system (like BullMQ) for bulk operations.

---

## 📋 Production Checklist

- [ ] **Encryption**: Are tokens encrypted at rest?
- [ ] **HTTPS**: Is the application served over TLS 1.2+?
- [ ] **Environment**: Is `QUICKBOOKS_ENVIRONMENT` set to `production`?
- [ ] **Monitoring**: Are you logging token refresh failures?
- [ ] **Validation**: Are you validating the `realmId` for every request?
- [ ] **Redirect URIs**: Are production URIs whitelisted in the Intuit Portal?

---

## 🚨 Common Production Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| `Invalid Grant` | Expired Refresh Token | Re-run the full OAuth flow. |
| `Unauthorized` | Expired Access Token | Call the refresh endpoint. |
| `Realm ID Mismatch` | Wrong Company Context | Verify the `realmId` matches the token. |

---

## 📚 Related Documentation

- [README.md](README.md) - Main documentation
- [INTEGRATION_GUIDE.md](INTEGRATION_GUIDE.md) - Step-by-step integration
- [EXAMPLES.md](EXAMPLES.md) - Code examples
- [QUICKBOOKS_REFRESH_TOKEN_LIFECYCLE.md](QUICKBOOKS_REFRESH_TOKEN_LIFECYCLE.md) - Token management deep dive

---

**Built for Scale. Optimized for Production. 🚀**

