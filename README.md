# QuickBooks Online API Integration Guide with NestJS 🚀

[![NestJS](https://img.shields.io/badge/framework-NestJS-E0234E.svg)](https://nestjs.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![QuickBooks](https://img.shields.io/badge/API-QuickBooks%20Online-2CA01C.svg)](https://developer.intuit.com/)
[![Swagger](https://img.shields.io/badge/Documentation-Swagger%2FOpenAPI-85EA2D.svg)](https://swagger.io/)

A comprehensive, production-ready guide and boilerplate for integrating **QuickBooks Online API** with **NestJS**. This project demonstrates best practices for **OAuth 2.0 authentication**, secure token management, and complete CRUD operations for accounting entities.

---

## 🌟 Key Features

- 🔐 **Robust OAuth 2.0 Flow**: Complete implementation of the Intuit OAuth 2.0 handshake.
- 🏗️ **Production-Ready Endpoints**: Direct token exchange and manual token setting for seamless integration.
- 📝 **Swagger/OpenAPI Documentation**: Interactive API testing and detailed schema definitions.
- 🔄 **Automated Token Management**: Built-in mechanisms for token refresh and status monitoring.
- ✅ **Type-Safe Operations**: Fully typed DTOs and interfaces for Customers, Invoices, and Items.
- 🛠️ **Developer Friendly**: Easy setup for both Sandbox and Production environments.

---

## 📖 Table of Contents

- [Prerequisites](#-prerequisites)
- [QuickBooks Developer Setup](#-quickbooks-developer-setup)
- [Installation & Configuration](#-installation--configuration)
- [API Documentation (Swagger)](#-api-documentation-swagger)
- [Authentication Flow](#-authentication-flow)
- [Production Implementation](#-production-implementation)
- [Best Practices](#-best-practices)
- [Project Structure](#-project-structure)
- [Additional Resources](#-additional-resources)

---

## 📋 Prerequisites

Before you begin, ensure you have the following:

- **Node.js** (v18 or higher)
- **npm** or **yarn**
- A **QuickBooks Developer Account** ([Sign up here](https://developer.intuit.com/))
- A registered App in the Intuit Developer Portal

---

## 🔧 QuickBooks Developer Setup

1. **Create an App**: Log in to the [Intuit Developer Portal](https://developer.intuit.com/) and create a new "QuickBooks Online" app.
2. **Get Credentials**: Copy your `Client ID` and `Client Secret` from the app settings.
3. **Configure Redirect URI**: Add `http://localhost:3000/quickbooks/auth/callback` to your app's Redirect URIs.
4. **Select Scopes**: Ensure your app has `com.intuit.quickbooks.accounting` enabled.

---

## 🚀 Installation & Configuration

### 1. Clone & Install
```bash
cd "quickbook guide"
npm install
```

### 2. Environment Setup
Create a `.env` file based on `.env.example`:
```env
QUICKBOOKS_CLIENT_ID=your_client_id
QUICKBOOKS_CLIENT_SECRET=your_client_secret
QUICKBOOKS_REDIRECT_URI=http://localhost:3000/quickbooks/auth/callback
QUICKBOOKS_ENVIRONMENT=sandbox # or production
PORT=3000
```

### 3. Start Development Server
```bash
npm run start:dev
```

---

## 📡 API Documentation (Swagger)

Once the server is running, access the interactive Swagger UI at:
👉 **[http://localhost:3000/api](http://localhost:3000/api)**

The Swagger documentation provides:
- **Interactive Testing**: Execute API calls directly from your browser.
- **Request/Response Schemas**: Detailed models for all QuickBooks entities.
- **Authentication**: Easy way to provide your Bearer tokens for testing.

---

## 🔐 Authentication Flow

The project supports multiple ways to authenticate:

### Standard OAuth 2.0
1. **Authorize**: `GET /quickbooks/auth/authorize` returns the Intuit login URL.
2. **Callback**: QuickBooks redirects to `/quickbooks/auth/callback` with an authorization code.
3. **Exchange**: The system automatically exchanges the code for access and refresh tokens.

### Direct Token Management (Production)
For existing integrations, use these specialized endpoints:
- `POST /quickbooks/auth/exchange-code`: Directly exchange a code for tokens.
- `POST /quickbooks/auth/set-tokens`: Manually set tokens from your database.
- `POST /quickbooks/auth/refresh`: Refresh an expired access token.

---

## 🏭 Production Implementation

This guide includes a dedicated [PRODUCTION_GUIDE.md](PRODUCTION_GUIDE.md) covering:
- ✅ **Token Persistence**: How to store tokens securely in a database.
- ✅ **Encryption**: Best practices for protecting sensitive credentials.
- ✅ **Error Handling**: Graceful management of API rate limits and expirations.
- ✅ **Checklists**: Everything you need before going live.

---

## 💡 Best Practices

- **Security**: Never expose Client Secrets or Access Tokens in client-side code.
- **Rate Limiting**: Implement exponential backoff for QuickBooks API limits (100 req/min sandbox, 500 req/min production).
- **Validation**: Use the provided DTOs to ensure data integrity before sending to QuickBooks.
- **Logging**: Monitor token expiration and API errors for proactive maintenance.

---

## 🔄 Project Structure

```text
src/
├── main.ts                    # Entry point & Swagger configuration
├── quickbooks/                # Core QuickBooks module
│   ├── quickbooks.controller.ts # API Endpoints
│   ├── quickbooks.service.ts    # Business logic & API calls
│   └── dto/                   # Type-safe Data Transfer Objects
└── app.module.ts              # Root application module
```

---

## 📖 Additional Resources

Explore our detailed sub-guides for specific implementation details:

- 📘 [Integration Guide](INTEGRATION_GUIDE.md): Step-by-step walkthrough.
- 📗 [Authorization Options](AUTHORIZATION_OPTIONS.md): Deep dive into OAuth methods.
- 📙 [Code Examples](EXAMPLES.md): Practical snippets for common tasks.
- 📕 [Token Lifecycle](QUICKBOOKS_REFRESH_TOKEN_LIFECYCLE.md): Understanding token expiration.

---

## 🤝 Contributing & Support

This project is maintained as a guide for developers. Feel free to use it as a foundation for your own NestJS QuickBooks integrations.

For official API details, visit the [QuickBooks API Reference](https://developer.intuit.com/app/developer/qbo/docs/api/accounting/most-commonly-used/account).

---

**Happy Coding! 🚀**

