# QuickBooks Refresh Token Lifecycle

## ⚠️ Important: Refresh Tokens Are NOT Lifetime

**QuickBooks refresh tokens do NOT last forever.** They have expiration policies that you must handle.

## Refresh Token Expiration Policy

### Current Policy (As of November 2025)

- **Maximum Validity:** 5 years from issuance date
- **Expiration:** Refresh tokens expire after 5 years, regardless of usage
- **Previous Policy:** Previously, refresh tokens were long-lived if used every 100 days

### Key Points

1. **5-Year Expiration:** Even if you use the refresh token regularly, it will expire after 5 years
2. **No Automatic Extension:** Using a refresh token does NOT extend its expiration date
3. **Re-authentication Required:** When a refresh token expires, you must go through OAuth flow again

## Access Token vs Refresh Token

| Token Type | Lifetime | Purpose |
|------------|----------|---------|
| **Access Token** | 1 hour | Used for API calls |
| **Refresh Token** | 5 years maximum | Used to get new access tokens |

## Best Practices

### 1. Track Refresh Token Issue Date

Store when the refresh token was issued in your database:

```sql
CREATE TABLE quickbooks_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER,
    access_token TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    realm_id VARCHAR(255) NOT NULL,
    access_token_expires_at TIMESTAMP NOT NULL,
    refresh_token_issued_at TIMESTAMP NOT NULL, -- Track issue date
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 2. Monitor Refresh Token Expiration

```typescript
// Check if refresh token is about to expire (within 30 days)
function isRefreshTokenExpiringSoon(issuedAt: Date): boolean {
  const fiveYearsFromIssue = new Date(issuedAt);
  fiveYearsFromIssue.setFullYear(fiveYearsFromIssue.getFullYear() + 5);
  
  const thirtyDaysFromNow = new Date();
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
  
  return fiveYearsFromIssue <= thirtyDaysFromNow;
}

// Check if refresh token is expired
function isRefreshTokenExpired(issuedAt: Date): boolean {
  const fiveYearsFromIssue = new Date(issuedAt);
  fiveYearsFromIssue.setFullYear(fiveYearsFromIssue.getFullYear() + 5);
  return new Date() >= fiveYearsFromIssue;
}
```

### 3. Handle Refresh Token Expiration

```typescript
async function refreshAccessTokenSafely(refreshToken: string, issuedAt: Date) {
  // Check if refresh token is expired
  if (isRefreshTokenExpired(issuedAt)) {
    throw new Error('Refresh token expired. Re-authentication required.');
  }
  
  // Check if expiring soon (within 30 days)
  if (isRefreshTokenExpiringSoon(issuedAt)) {
    console.warn('Refresh token expiring soon. Consider re-authenticating.');
  }
  
  try {
    const response = await fetch('http://localhost:3000/quickbooks/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    
    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Refresh token invalid or expired. Re-authentication required.');
      }
      throw new Error(`Token refresh failed: ${response.statusText}`);
    }
    
    return response.json();
  } catch (error) {
    // Handle refresh token expiration
    if (error.message.includes('expired') || error.message.includes('invalid')) {
      // Trigger re-authentication flow
      await triggerReAuthentication();
    }
    throw error;
  }
}
```

### 4. Proactive Re-authentication

Before the refresh token expires, prompt users to re-authenticate:

```typescript
async function checkAndRenewRefreshToken(issuedAt: Date) {
  const daysUntilExpiration = getDaysUntilExpiration(issuedAt);
  
  if (daysUntilExpiration <= 30) {
    // Notify user to re-authenticate
    await notifyUser('Your QuickBooks connection will expire soon. Please re-authenticate.');
    
    // Optionally trigger re-authentication flow
    if (daysUntilExpiration <= 7) {
      await triggerReAuthentication();
    }
  }
}

function getDaysUntilExpiration(issuedAt: Date): number {
  const fiveYearsFromIssue = new Date(issuedAt);
  fiveYearsFromIssue.setFullYear(fiveYearsFromIssue.getFullYear() + 5);
  
  const now = new Date();
  const diffTime = fiveYearsFromIssue.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  return diffDays;
}
```

## Common Scenarios

### Scenario 1: Refresh Token Expires

**What happens:**
- You try to refresh the access token
- QuickBooks returns 401 Unauthorized
- Error: "AuthenticationFailed" or "Invalid refresh token"

**Solution:**
- User must go through OAuth flow again
- Get new authorization code
- Exchange for new tokens (including new refresh token)

### Scenario 2: Refresh Token Revoked

**What happens:**
- User revokes access in QuickBooks
- Refresh token becomes invalid immediately
- All subsequent refresh attempts fail

**Solution:**
- User must re-authenticate
- Get new authorization code
- Exchange for new tokens

### Scenario 3: Refresh Token Not Used for Long Time

**What happens:**
- Previously: Refresh tokens could expire if not used for 100+ days
- Current: Refresh tokens expire after 5 years regardless of usage

**Solution:**
- Use refresh token regularly (at least once every few months)
- Monitor expiration date
- Re-authenticate before expiration

## Implementation Example

### Complete Token Management

```typescript
interface TokenRecord {
  access_token: string;
  refresh_token: string;
  realmId: string;
  access_token_expires_at: Date;
  refresh_token_issued_at: Date;
}

class QuickBooksTokenManager {
  async refreshTokenIfNeeded(tokenRecord: TokenRecord): Promise<TokenRecord> {
    // Check if access token is expired
    if (new Date() >= tokenRecord.access_token_expires_at) {
      // Check if refresh token is still valid
      if (this.isRefreshTokenExpired(tokenRecord.refresh_token_issued_at)) {
        throw new Error('Refresh token expired. Re-authentication required.');
      }
      
      // Refresh access token
      const newTokens = await this.refreshAccessToken(tokenRecord.refresh_token);
      
      // Update token record
      return {
        ...tokenRecord,
        access_token: newTokens.access_token,
        refresh_token: newTokens.refresh_token, // May be same or new
        access_token_expires_at: new Date(Date.now() + newTokens.expires_in * 1000),
        // Note: refresh_token_issued_at stays the same unless you get a new one
      };
    }
    
    return tokenRecord;
  }
  
  isRefreshTokenExpired(issuedAt: Date): boolean {
    const fiveYearsFromIssue = new Date(issuedAt);
    fiveYearsFromIssue.setFullYear(fiveYearsFromIssue.getFullYear() + 5);
    return new Date() >= fiveYearsFromIssue;
  }
  
  async refreshAccessToken(refreshToken: string) {
    const response = await fetch('http://localhost:3000/quickbooks/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    
    if (!response.ok) {
      throw new Error('Token refresh failed');
    }
    
    return response.json();
  }
}
```

## Monitoring and Alerts

### Set Up Monitoring

```typescript
// Check token expiration daily
async function dailyTokenCheck() {
  const tokens = await db.getAllTokens();
  
  for (const token of tokens) {
    const daysUntilExpiration = getDaysUntilExpiration(token.refresh_token_issued_at);
    
    if (daysUntilExpiration <= 30) {
      // Send alert
      await sendAlert({
        userId: token.user_id,
        message: `QuickBooks connection expires in ${daysUntilExpiration} days`,
        action: 're-authenticate',
      });
    }
  }
}

// Run daily check
setInterval(dailyTokenCheck, 24 * 60 * 60 * 1000); // Every 24 hours
```

## Summary

✅ **Do:**
- Track refresh token issue date
- Monitor expiration (5 years from issue)
- Proactively re-authenticate before expiration
- Handle refresh token expiration gracefully
- Store tokens securely

❌ **Don't:**
- Assume refresh tokens last forever
- Ignore expiration warnings
- Wait until token expires to re-authenticate
- Store tokens in plain text

## References

- [QuickBooks OAuth Documentation](https://developer.intuit.com/app/developer/qbo/docs/develop/authentication-and-authorization)
- [Intuit Blog: Refresh Token Policy Changes](https://blogs.intuit.com/2025/11/12/important-changes-to-refresh-token-policy/)

---

**Remember:** Refresh tokens expire after 5 years. Plan accordingly and implement proper monitoring!

