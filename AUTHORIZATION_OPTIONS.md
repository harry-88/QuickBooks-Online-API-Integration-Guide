# QuickBooks Authorization Options

This document explains the different ways to initiate QuickBooks OAuth authorization from your backend.

## ⚠️ Important Note

**Full automation without user interaction is NOT possible** due to OAuth 2.0 security requirements. QuickBooks requires:
- User login to their QuickBooks account
- User consent to grant permissions
- This is a security feature, not a limitation

However, we provide multiple convenient ways to initiate the authorization flow from your backend.

## Authorization Methods

### 1. Get Authorization URL (JSON Response)

**Endpoint:** `GET /quickbooks/auth/authorize`

Returns the authorization URL as JSON. You can then redirect users programmatically.

```bash
curl http://localhost:3000/quickbooks/auth/authorize
```

**Response:**
```json
{
  "authorizationUrl": "https://appcenter.intuit.com/connect/oauth2?...",
  "message": "Redirect user to this URL for authorization"
}
```

**Use Case:** When you need the URL to handle redirects in your frontend or custom logic.

---

### 2. Direct Redirect (Automatic Redirect)

**Endpoint:** `GET /quickbooks/auth/redirect`

Automatically redirects the browser to QuickBooks authorization page.

```bash
# In browser, just visit:
http://localhost:3000/quickbooks/auth/redirect

# Or with state parameter:
http://localhost:3000/quickbooks/auth/redirect?state=your_state_value
```

**Use Case:** Simplest way to start authorization - just visit the URL in a browser.

**Example in HTML:**
```html
<a href="http://localhost:3000/quickbooks/auth/redirect">
  Connect to QuickBooks
</a>
```

**Example in JavaScript:**
```javascript
window.location.href = 'http://localhost:3000/quickbooks/auth/redirect';
```

---

### 3. HTML Page with Auto-Redirect

**Endpoint:** `GET /quickbooks/auth/page`

Returns a beautiful HTML page that automatically redirects to QuickBooks after 1 second.

```bash
# In browser, visit:
http://localhost:3000/quickbooks/auth/page
```

**Features:**
- Beautiful loading page with spinner
- Automatic redirect after 1 second
- Manual link if auto-redirect fails
- Professional UI

**Use Case:** 
- Testing the OAuth flow
- Embedding in iframes (if QuickBooks allows)
- Providing a better user experience with a loading page

**Example:**
```html
<iframe src="http://localhost:3000/quickbooks/auth/page" width="800" height="600"></iframe>
```

---

## Complete Authorization Flow

### Option A: Using Direct Redirect (Recommended for Testing)

1. **Visit the redirect endpoint:**
   ```
   http://localhost:3000/quickbooks/auth/redirect
   ```

2. **User is redirected to QuickBooks:**
   - User logs in
   - User grants permissions

3. **QuickBooks redirects back:**
   ```
   http://localhost:3000/quickbooks/auth/callback?code=xxx&realmId=xxx
   ```

4. **Tokens are automatically exchanged:**
   - Access token
   - Refresh token
   - Realm ID

### Option B: Using HTML Page

1. **Visit the page endpoint:**
   ```
   http://localhost:3000/quickbooks/auth/page
   ```

2. **Page automatically redirects to QuickBooks** (after 1 second)

3. **User logs in and grants permissions**

4. **QuickBooks redirects back to callback**

5. **Tokens are automatically exchanged**

### Option C: Programmatic (For Production)

1. **Get authorization URL:**
   ```javascript
   const response = await fetch('http://localhost:3000/quickbooks/auth/authorize');
   const { authorizationUrl } = await response.json();
   ```

2. **Redirect user:**
   ```javascript
   window.location.href = authorizationUrl;
   ```

3. **Handle callback** (already implemented in `/quickbooks/auth/callback`)

---

## State Parameter (CSRF Protection)

All endpoints support an optional `state` parameter for CSRF protection:

```bash
# With state parameter
http://localhost:3000/quickbooks/auth/redirect?state=unique_state_value
```

**Best Practice:** Generate a unique state value, store it in session, and verify it in the callback.

---

## Backend Integration Examples

### Express.js / NestJS Middleware

```typescript
// Redirect to QuickBooks authorization
app.get('/connect-quickbooks', (req, res) => {
  res.redirect('http://localhost:3000/quickbooks/auth/redirect');
});
```

### React Component

```typescript
const ConnectQuickBooks = () => {
  const handleConnect = () => {
    window.location.href = 'http://localhost:3000/quickbooks/auth/redirect';
  };

  return (
    <button onClick={handleConnect}>
      Connect to QuickBooks
    </button>
  );
};
```

### Server-Side Redirect (Node.js)

```typescript
// In your route handler
app.get('/auth/quickbooks', (req, res) => {
  const authUrl = 'http://localhost:3000/quickbooks/auth/redirect';
  res.redirect(authUrl);
});
```

---

## Comparison Table

| Method | Endpoint | Returns | Use Case |
|--------|----------|---------|----------|
| JSON URL | `/quickbooks/auth/authorize` | JSON with URL | Programmatic handling, custom frontend |
| Direct Redirect | `/quickbooks/auth/redirect` | HTTP 302 Redirect | Simplest, direct browser redirect |
| HTML Page | `/quickbooks/auth/page` | HTML with auto-redirect | Better UX, testing, iframes |

---

## Recommendations

1. **For Development/Testing:**
   - Use `/quickbooks/auth/redirect` - simplest and fastest

2. **For Production Frontend:**
   - Use `/quickbooks/auth/authorize` to get URL
   - Handle redirect in your frontend code
   - Add proper state parameter for security

3. **For Better UX:**
   - Use `/quickbooks/auth/page` for a polished loading experience

4. **For API Integration:**
   - Use `/quickbooks/auth/authorize` to get URL
   - Implement custom redirect logic
   - Store state in session/database

---

## Security Considerations

1. **Always use HTTPS in production**
2. **Implement state parameter validation**
3. **Store tokens securely (encrypted)**
4. **Never expose tokens in client-side code**
5. **Implement token refresh before expiration**

---

## Troubleshooting

### Redirect not working?
- Check that redirect URI matches QuickBooks app settings exactly
- Ensure you're using the correct environment (sandbox vs production)
- Verify CORS is enabled in your NestJS app

### Page not redirecting?
- Check browser console for errors
- Verify QuickBooks credentials are correct
- Ensure server is running

### State parameter issues?
- State must be validated in callback
- Store state in session or database
- State should be unique per request

---

## Next Steps

After successful authorization:
1. Store tokens securely in your database
2. Use access token for API calls
3. Implement token refresh before expiration
4. Handle token revocation

For more details, see:
- [README.md](README.md) - Main documentation
- [INTEGRATION_GUIDE.md](INTEGRATION_GUIDE.md) - Step-by-step guide
- [EXAMPLES.md](EXAMPLES.md) - Code examples

