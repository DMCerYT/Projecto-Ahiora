# Domain model

Contractors are external contacts, not users. Owner, Admin, and Employee are user roles; all employees report to the owner. Each user belongs to one business. References and payment states follow the agreed model, with primary references required except for property income.

```mermaid
classDiagram
    Business "1" -- "1" Owner : owned by
    Business "1" -- "0..*" Admin : has
    Business "1" -- "0..*" Employee : employs
    User <|-- Owner
    User <|-- Admin
    User <|-- Employee
    Employee "0..*" --> "1" Owner : reports to
    Business "1" -- "0..*" Contractor : engages
    Business "1" -- "0..*" Project : manages
    Employee "0..*" -- "0..*" Project : assigned to
    Contractor "0..*" -- "0..*" Project : assigned to
    Project "0..1" -- "0..*" Transaction : records
    Business "1" -- "0..*" Property : manages
    Property "0..1" -- "0..*" Transaction : records
    Business "1" -- "0..*" Bill : manages
    Bill "1" -- "1..*" BillOccurrence : schedules
    Bill "1" -- "0..1" BillImage : illustrated by
    BillOccurrence "1" -- "0..1" Payment : settled by
    Payment "0..1" -- "0..1" Transaction : recorded as
    Business "1" -- "0..*" BillingAccount : maintains
    BillingAccount "1" -- "0..*" Payment : funds
    Bill "0..*" --> "0..1" BillingAccount : default account
    Transaction "0..1" -- "0..*" Reference : supported by
    BillOccurrence "0..1" -- "0..*" Reference : evidenced by
    Reference "1" -- "0..*" FileAttachment : contains
    User "1" -- "0..*" Reference : records
    User "1" -- "0..*" Comment : authors
    Project "0..1" -- "0..*" Comment : discussed in
    Transaction "0..1" -- "0..*" Comment : discussed in
    class User {
        userId
        name
        email
        preferredLanguage
    }
    class Admin {
        lastAccessedAt
    }
    class Employee {
        title
    }
    class Contractor {
        name
        email
        phone
        address
    }
    class Reference {
        referenceNumber_required_except_property_income
        evidenceDateTime_optional
        description_optional
        createdAt
    }
    class Payment {
        paymentDate
        amount
        status
    }
```

Additional constraints: a reference has at least one target and requires a receipt ID except for property income; reference dates, notes and attachments are optional; a comment has exactly one target. A processed payment has exactly one expense transaction; processing/failed payments have none. Shared transaction/occurrence references identify the same payment. Monetary storage uses cents; project balances are derived. The implementation uses role columns and assignment relations rather than separate Owner/Admin/Employee tables.

Manual transactions target exactly one project or property. Payment-generated expenses target their standalone bill instead and never affect project/property balances. Project budgets default to zero. Reporting supports YTD (default), this month, trailing three months, trailing twelve months, and lifetime; income and refunds remain distinct amounts. Team navigation is hidden; property and standalone bill records are visible to owners/admins only.

Property income can be recorded with just amount and date, with an optional name defaulting to Rent income. Its primary reference is nullable; refund and expense evidence requirements remain unchanged. Reference dates contain no time for new records, and legacy timestamps are presented as business-local dates.
