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

export interface QuickBooksAddress {
    Id?: string;
    Line1?: string;
    Line2?: string;
    City?: string;
    Country?: string;
    CountrySubDivisionCode?: string;
    PostalCode?: string;
}

export interface QuickBooksEmail {
    Address: string;
}

export interface QuickBooksPhone {
    FreeFormNumber: string;
}

export interface QuickBooksReference {
    value: string;
    name?: string;
}

export interface QuickBooksCustomer {
    Id?: string;
    SyncToken?: string;
    DisplayName: string;
    PrimaryEmailAddr?: QuickBooksEmail;
    PrimaryPhone?: QuickBooksPhone;
    BillAddr?: QuickBooksAddress;
    Notes?: string;
    Active?: boolean;
}

export interface QuickBooksAccount {
    Id: string;
    SyncToken?: string;
    Name: string;
    AccountType: string;
    AccountSubType?: string;
    Active: boolean;
    Classification?: string;
}

export interface QuickBooksItem {
    Id?: string;
    SyncToken?: string;
    Name: string;
    Type: 'Service' | 'Inventory' | 'NonInventory';
    UnitPrice?: number;
    Description?: string;
    Sku?: string;
    IncomeAccountRef?: QuickBooksReference;
    ExpenseAccountRef?: QuickBooksReference;
    AssetAccountRef?: QuickBooksReference;
    TrackQtyOnHand?: boolean;
    QtyOnHand?: number;
    InvStartDate?: string;
    Active?: boolean;
}

export interface QuickBooksLine {
    Id?: string;
    LineNum?: number;
    Description?: string;
    Amount: number;
    DetailType: 'SalesItemLineDetail' | 'GroupLineDetail' | 'DescriptionOnly' | 'SubTotalLineDetail';
    SalesItemLineDetail?: {
        ItemRef: QuickBooksReference;
        UnitPrice?: number;
        Qty?: number;
        TaxCodeRef?: QuickBooksReference;
    };
}

export interface QuickBooksInvoice {
    Id?: string;
    SyncToken?: string;
    DocNumber?: string;
    TxnDate?: string;
    DueDate?: string;
    CustomerRef: QuickBooksReference;
    Line: QuickBooksLine[];
    TotalAmt?: number;
    Balance?: number;
    sparse?: boolean;
    EmailStatus?: 'NotSet' | 'NeedToSend' | 'EmailSent';
    PrintStatus?: 'NotSet' | 'NeedToPrint' | 'PrintComplete';
}

export interface QuickBooksPaymentLine {
    Amount: number;
    LinkedTxn: {
        TxnId?: string;
        TxnType?: 'Invoice' | 'CreditMemo' | 'Bill' | string;
    }[];
}

export interface QuickBooksPayment {
    Id?: string;
    SyncToken?: string;
    TotalAmt: number;
    CustomerRef: QuickBooksReference;
    Line?: QuickBooksPaymentLine[];
    PaymentRefNum?: string;
    PaymentMethodRef?: QuickBooksReference;
    TxnDate?: string;
    PrivateNote?: string;
}

export interface QuickBooksQueryResponse<T> {
    [key: string]: T[] | number | undefined;
    totalCount?: number;
    startPosition?: number;
    maxResults?: number;
}

export interface QuickBooksPaginatedResponse<T> {
    items: T[];
    totalCount: number;
    startPosition: number;
    maxResults: number;
}
