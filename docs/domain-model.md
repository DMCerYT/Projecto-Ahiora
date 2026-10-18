# Domain model

Contractors are external contacts, not users. Owner, Admin, and Employee are user roles; all employees report to the owner. Each user belongs to one business. References and payment states follow the agreed model, with a required primary reference enforcing the transaction's evidence relationship.

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
    Project "1" -- "0..*" Transaction : records
    Project "1" -- "0..*" Bill : allocated to
    Bill "1" -- "1..*" BillOccurrence : schedules
    BillOccurrence "1" -- "0..1" Payment : settled by
    Payment "0..1" -- "0..1" Transaction : recorded as
    Business "1" -- "0..*" BillingAccount : maintains
    BillingAccount "1" -- "0..*" Payment : funds
    Bill "0..*" --> "0..1" BillingAccount : default account
    Transaction "0..1" -- "1..*" Reference : supported by
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
        referenceNumber_optional
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

Additional constraints: a reference has at least one target and one piece of evidence; a comment has exactly one target. A processed payment has exactly one expense transaction; processing/failed payments have none. Shared transaction/occurrence references identify the same payment. Monetary storage uses cents; project balances are derived. The implementation uses role columns and assignment relations rather than separate Owner/Admin/Employee tables.
