# TicketHub — System Design

## 1. Requirements

TicketHub is an online ticketing platform where users discover events, view seat availability, reserve seats, pay for tickets, and view their purchases.

The system must remain responsive and fair when a popular concert attracts far more buyers than available seats.

### 1.1 Functional requirements

1. Users can register, log in, and manage their accounts.
2. Users can browse and search events by name, venue, date, and category.
3. Users can view event details, prices, and seat availability.
4. Users can temporarily hold available seats while completing checkout.
5. Users can pay for an order and receive a confirmed ticket after successful payment.
6. Users can view their order history and purchased tickets.
7. Users can cancel orders where the event's cancellation policy permits it.
8. The system can expire unpaid seat holds and release seats for other customers.
9. Administrators can create events, configure seating, set prices, and monitor sales.
10. The system records payment outcomes and supports safe retries without charging customers twice.

### 1.2 Non-functional requirements

**Speed**
- Target a 95th-percentile response time below 300 ms for ordinary event browsing and seat-availability reads under expected load.
- Keep checkout responsive during high-demand sales.
- Use caching for public event information, while avoiding stale availability claims.

**Correctness and consistency**
- A physical seat must never be sold to more than one customer for the same event.
- Only successful, verified payments can result in confirmed orders.
- Inventory changes and order updates must be committed consistently.
- Payment retries must not create duplicate charges or duplicate confirmed tickets.

**Fairness**
- Apply a clear, published sale-opening time.
- Use a virtual waiting room or admission queue during major sales.
- Admit buyers at a controlled rate rather than allowing a small number of clients to overwhelm the system.
- Apply consistent hold durations and purchase limits.
- Do not let users gain unfair priority simply by repeatedly refreshing or sending excessive requests.

Fairness means transparent, consistently applied rules; it does not necessarily mean that every person will obtain a ticket.

**Availability and resilience**
- Continue serving requests if an application server fails.
- Use durable queues, backups, monitoring, and tested recovery procedures.
- Degrade gracefully if a nonessential service becomes unavailable.

**Security**
- Use HTTPS and secure authentication.
- Authorize access to orders and tickets by user identity.
- Verify payment notifications with the payment provider.
- Rate-limit abuse and protect against bots and automated purchasing.
- Never store raw payment-card details; use a compliant payment provider.

**Scalability**
- Support two million registered users.
- Scale application servers horizontally.
- Isolate high-demand events so one sale does not exhaust the capacity needed by other events.

## 2. Traffic and capacity estimates

The estimates below use the supplied figures and explicit assumptions. They are planning estimates, not measured production results.

### 2.1 Normal-day traffic

Given:
- Registered users: 2,000,000.
- Daily visitors: 50,000.
- Pages viewed per visitor: 10.
- Tickets sold per day: 5,000.

Daily page views:

50,000 visitors × 10 pages = **500,000 page views per day**.

Average page-view rate:

500,000 ÷ 86,400 seconds ≈ **5.8 page views per second**.

Average ticket sales rate:

5,000 ÷ 86,400 ≈ **0.058 tickets per second**, or approximately 208 tickets per hour averaged across the full day.

Page views are not the same as API requests. Each page may call multiple endpoints, and actual traffic will be higher during busy periods.

For a rough API capacity estimate, assume three API requests per page view:

500,000 × 3 = 1,500,000 API requests per day.

1,500,000 ÷ 86,400 ≈ **17.4 API requests per second on average**.

### 2.2 Popular-concert sale

Given:
- 200,000 people attempt to buy tickets.
- Only 20,000 seats are available.
- The attempts occur within the first 10 minutes.

Average arrival rate:

200,000 ÷ 600 seconds ≈ **333 people per second**.

Only 20,000 ÷ 200,000 = **10%** of these potential buyers can receive one seat if every person wants one ticket and all seats are sold.

Assume each potential buyer makes five API requests during browsing and checkout:

200,000 × 5 = 1,000,000 API requests in 10 minutes.

1,000,000 ÷ 600 ≈ **1,667 API requests per second on average during the sale**.

Real traffic is unlikely to be evenly distributed. If the busiest moments reach three times this average, the system should plan for approximately **5,000 API requests per second** as an initial burst scenario.

The actual peak should be validated through load testing and traffic measurements. The estimate does not imply that all 200,000 people successfully reach checkout.

### 2.3 Comparison

| Metric | Normal day | Popular-concert sale |
|---|---:|---:|
| People visiting or attempting to buy | 50,000 daily visitors | 200,000 within 10 minutes |
| Page views / assumed API requests | 500,000 page views daily; ~17.4 API requests/sec on average under the three-request assumption | ~1,000,000 API requests in 10 minutes under the five-request assumption |
| Average API request rate | ~17.4 requests/sec | ~1,667 requests/sec |
| Estimated burst target | Establish through monitoring | ~5,000 requests/sec under the three-times-peak assumption |
| Inventory demand | Typical daily sales | 200,000 potential buyers for 20,000 seats |
| Main risk | Ordinary latency and availability | Overload, unfair access, payment retries, and double-booking |

Under these assumptions, the sale's average API request rate is approximately 96 times the normal-day estimated average (1,667 ÷ 17.4). This is why TicketHub needs admission control, horizontally scalable application servers, caching, and strict database inventory protection.

### 2.4 Capacity strategy

- Cache public event descriptions and venue information.
- Send high-demand buyers through a virtual waiting room.
- Limit the rate at which buyers enter checkout.
- Scale application servers horizontally.
- Keep inventory decisions in the authoritative database.
- Use connection pooling and short database transactions.
- Load-test the sale flow, payment callbacks, queue behavior, and failure recovery before a major launch.

## 3. API design

The API uses HTTPS and JSON. Authenticated endpoints require a valid session or access token. Order and ticket access must be restricted to the authenticated owner.

| Method and endpoint | Purpose | Successful response |
|---|---|---|
| `GET /api/v1/events` | Browse events with search, filters, and pagination | `200 OK` |
| `GET /api/v1/events/{eventId}` | View event details | `200 OK` |
| `GET /api/v1/events/{eventId}/seats` | View seat availability and prices | `200 OK` |
| `POST /api/v1/seat-holds` | Temporarily hold an available seat | `201 Created` |
| `DELETE /api/v1/seat-holds/{holdId}` | Release a user's active hold | `204 No Content` |
| `POST /api/v1/orders` | Create an order for a valid hold | `201 Created` |
| `POST /api/v1/orders/{orderId}/payments` | Start payment for an order | `202 Accepted` |
| `GET /api/v1/orders/{orderId}` | View order and payment status | `200 OK` |
| `GET /api/v1/me/tickets` | List the authenticated user's confirmed tickets | `200 OK` |

### 3.1 Browse events

`GET /api/v1/events?date=2026-12-10&page=1&limit=20`

Example response:

```json
{
  "data": [
    {
      "id": 410,
      "name": "Summer Live",
      "venue": "City Arena",
      "startsAt": "2026-12-10T18:00:00Z",
      "currency": "KES",
      "startingPrice": 2500
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 42
  }
}
```

### 3.2 View seats

`GET /api/v1/events/410/seats`

Example response:

```json
{
  "eventId": 410,
  "seats": [
    {
      "id": 9001,
      "label": "A-12",
      "price": 2500,
      "status": "AVAILABLE"
    },
    {
      "id": 9002,
      "label": "A-13",
      "price": 2500,
      "status": "HELD"
    }
  ]
}
```

Seat availability is a snapshot. A seat shown as available may be held by another buyer before the current user submits a hold request. The server must recheck inventory atomically when creating a hold.

### 3.3 Hold a seat

`POST /api/v1/seat-holds`

Request:

```json
{
  "eventId": 410,
  "seatId": 9001
}
```

Example response:

```json
{
  "holdId": "hold_731",
  "eventId": 410,
  "seatId": 9001,
  "status": "ACTIVE",
  "expiresAt": "2026-12-01T12:05:00Z"
}
```

The hold might last five minutes, depending on the sale policy. The server—not the browser—sets the expiry time and confirms whether the seat was actually reserved.

If another buyer already holds or purchased the seat, return `409 Conflict`. Clients must refresh availability and choose another seat.

### 3.4 Create an order

`POST /api/v1/orders`

Request:

```json
{
  "holdId": "hold_731",
  "idempotencyKey": "checkout-7a82"
}
```

Example response:

```json
{
  "orderId": 7201,
  "status": "PENDING_PAYMENT",
  "amount": 2500,
  "currency": "KES"
}
```

The server checks that the hold belongs to the authenticated user, remains valid, and has not already been used. The idempotency key helps ensure that retrying the same request does not create duplicate orders.

### 3.5 Start payment

`POST /api/v1/orders/7201/payments`

Request:

```json
{
  "provider": "configured-payment-provider",
  "paymentMethodToken": "provider-generated-token",
  "idempotencyKey": "payment-7201-attempt-1"
}
```

Example response:

```json
{
  "orderId": 7201,
  "paymentStatus": "PROCESSING",
  "message": "Payment is being processed."
}
```

The payment provider handles sensitive payment details. TicketHub verifies the provider's signed callback or queries the provider's trusted API before confirming the order. A browser redirect alone is not proof of payment.

### 3.6 View tickets

`GET /api/v1/me/tickets`

Example response:

```json
{
  "data": [
    {
      "ticketId": 8801,
      "orderId": 7201,
      "eventId": 410,
      "seatLabel": "A-12",
      "status": "CONFIRMED"
    }
  ]
}
```

The server derives the user identity from authentication and returns only tickets owned by that user.

### 3.7 Error responses

Use consistent JSON errors, for example:

```json
{
  "error": {
    "code": "SEAT_UNAVAILABLE",
    "message": "This seat is no longer available.",
    "requestId": "req_12345"
  }
}
```

Common status codes include:

- `400 Bad Request`: Invalid request format or parameters.
- `401 Unauthorized`: Missing or invalid authentication.
- `403 Forbidden`: The user is not allowed to perform the action.
- `404 Not Found`: The requested resource does not exist or is not visible to the user.
- `409 Conflict`: Seat unavailable, hold expired, or order state conflict.
- `422 Unprocessable Content`: Valid JSON that fails business validation.
- `429 Too Many Requests`: Rate limit or admission policy exceeded.
- `500 Internal Server Error`: Unexpected server failure.
- `503 Service Unavailable`: Temporary overload or unavailable dependency.

## 4. Data model

Use a relational database such as PostgreSQL because ticket inventory requires strong consistency, transactions, and uniqueness constraints.

The core entities are `users`, `events`, `seats`, and `orders`. Supporting tables record seat holds, individual order items, and payment attempts.

### 4.1 Tables and relationships

**Users**
- `id` — primary key.
- `name` — user's display name.
- `email` — unique email address.
- `password_hash` — secure password hash.
- `created_at` — registration timestamp.

**Events**
- `id` — primary key.
- `name` — event name.
- `venue` — venue name.
- `starts_at` — event start time.
- `status` — draft, published, on sale, or cancelled.
- `created_at` — creation timestamp.

**Seats**
- `id` — primary key.
- `event_id` — foreign key to `events.id`.
- `label` — seat identifier within an event.
- `price` — ticket price in the event's currency.
- `status` — available, held, or sold.
- `held_by_user_id` — nullable foreign key to `users.id`.
- `hold_expires_at` — nullable expiry timestamp.
- `created_at` — creation timestamp.

The combination of `event_id` and `label` must be unique, so an event cannot contain duplicate seat labels.

**Orders**
- `id` — primary key.
- `user_id` — foreign key to `users.id`.
- `status` — pending payment, confirmed, failed, cancelled, or expired.
- `total_amount` — amount due in the event's currency.
- `currency` — currency code such as `KES`.
- `idempotency_key` — unique key for safe order-creation retries.
- `created_at` — order creation timestamp.

**Order_Items**
- `id` — primary key.
- `order_id` — foreign key to `orders.id`.
- `seat_id` — foreign key to `seats.id`.
- `price_at_purchase` — immutable price snapshot.
- `status` — pending, confirmed, cancelled, or expired.

An order can contain one or more seats. A partial unique index ensures a seat cannot belong to multiple active or confirmed order items.

**Seat_Holds**
- `id` — primary key.
- `seat_id` — foreign key to `seats.id`.
- `user_id` — foreign key to `users.id`.
- `expires_at` — hold expiry timestamp.
- `status` — active, converted, released, or expired.
- `created_at` — hold creation timestamp.

**Payment_Attempts**
- `id` — primary key.
- `order_id` — foreign key to `orders.id`.
- `provider_reference` — unique provider transaction reference, when available.
- `idempotency_key` — unique key for a payment attempt.
- `status` — processing, succeeded, or failed.
- `amount` — attempted payment amount.
- `created_at` — attempt timestamp.

### 4.2 Relationship summary

- One user can create many orders.
- One event can contain many seats.
- Each seat belongs to exactly one event.
- One order can contain multiple order items.
- Each order item refers to one seat.
- One user can create multiple seat holds over time.
- A seat can have multiple historical holds, but only one active hold at a time.
- One order can have multiple payment attempts, but the same payment attempt must not be processed twice.

### 4.3 Example PostgreSQL constraints

Illustrative schema excerpts:

```sql
CREATE TABLE users (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE events (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    venue VARCHAR(200) NOT NULL,
    starts_at TIMESTAMPTZ NOT NULL,
    status VARCHAR(20) NOT NULL
        CHECK (status IN ('DRAFT', 'PUBLISHED', 'ON_SALE', 'CANCELLED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE seats (
    id BIGSERIAL PRIMARY KEY,
    event_id BIGINT NOT NULL REFERENCES events(id),
    label VARCHAR(30) NOT NULL,
    price NUMERIC(12, 2) NOT NULL CHECK (price >= 0),
    status VARCHAR(20) NOT NULL DEFAULT 'AVAILABLE'
        CHECK (status IN ('AVAILABLE', 'HELD', 'SOLD')),
    held_by_user_id BIGINT REFERENCES users(id),
    hold_expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (event_id, label)
);

CREATE TABLE orders (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id),
    status VARCHAR(30) NOT NULL
        CHECK (status IN (
            'PENDING_PAYMENT', 'CONFIRMED', 'FAILED', 'CANCELLED', 'EXPIRED'
        )),
    total_amount NUMERIC(12, 2) NOT NULL CHECK (total_amount >= 0),
    currency CHAR(3) NOT NULL DEFAULT 'KES',
    idempotency_key VARCHAR(100) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE order_items (
    id BIGSERIAL PRIMARY KEY,
    order_id BIGINT NOT NULL REFERENCES orders(id),
    seat_id BIGINT NOT NULL REFERENCES seats(id),
    price_at_purchase NUMERIC(12, 2) NOT NULL
        CHECK (price_at_purchase >= 0),
    status VARCHAR(20) NOT NULL
        CHECK (status IN ('PENDING', 'CONFIRMED', 'CANCELLED', 'EXPIRED'))
);

CREATE UNIQUE INDEX uq_order_items_active_seat
ON order_items (seat_id)
WHERE status IN ('PENDING', 'CONFIRMED');
```

Additional `seat_holds` and `payment_attempts` tables should be created with the columns and foreign keys described above. In the full implementation, status changes and expiry handling must be coordinated transactionally with seat inventory.

The partial unique index is a second line of defense against duplicate active orders for the same seat. Cancelled and expired items no longer occupy the unique index. Database permissions and application logic must prevent invalid status transitions.

### 4.4 Indexes

Recommended initial indexes include:

```sql
CREATE INDEX idx_events_starts_at
ON events (starts_at);

CREATE INDEX idx_seats_event_status
ON seats (event_id, status);

CREATE INDEX idx_orders_user_created
ON orders (user_id, created_at DESC);
```

These support event browsing, seat availability queries, and a user's order history. Primary keys and unique constraints create their own indexes. Indexes should be reviewed using actual query plans and production measurements.

## 5. Preventing two people from buying the same seat

This is the most important correctness requirement in TicketHub.

Displaying a seat as available is not enough. Two customers can see the same availability snapshot and click the seat almost simultaneously. The backend must serialize their attempts using the authoritative database.

### 5.1 Atomic seat-hold transaction

When a customer requests a hold:

1. Begin a database transaction.
2. Select the requested seat row using `SELECT ... FOR UPDATE`.
3. Check that the seat belongs to the requested event.
4. Check whether the seat is available, or whether its previous hold has expired.
5. If another valid hold exists or the seat is sold, reject the request with `409 Conflict`.
6. Otherwise, update the seat to `HELD`, assign the authenticated user, and set the server-controlled expiry timestamp.
7. Create the corresponding hold record and commit the transaction.

Example pseudocode:

```sql
BEGIN;

SELECT id, status, held_by_user_id, hold_expires_at
FROM seats
WHERE id = :seat_id
  AND event_id = :event_id
FOR UPDATE;

-- Application checks the locked row:
-- AVAILABLE, or HELD with hold_expires_at <= current time.

UPDATE seats
SET status = 'HELD',
    held_by_user_id = :authenticated_user_id,
    hold_expires_at = CURRENT_TIMESTAMP + INTERVAL '5 minutes'
WHERE id = :seat_id
  AND (
      status = 'AVAILABLE'
      OR (
          status = 'HELD'
          AND hold_expires_at <= CURRENT_TIMESTAMP
      )
  );

-- Check that exactly one row was updated.
-- Create the seat_holds record in this transaction.

COMMIT;
```

This is illustrative pseudocode; the real implementation must check the row returned by the locking query, handle missing rows, and insert or update the hold record consistently.

The row lock ensures that competing transactions cannot both make the decision using the same unlocked seat state. The second transaction waits, then sees the first transaction's committed state and is rejected unless the hold has expired.

### 5.2 Payment and confirmation

1. The customer pays for the order while the hold is valid.
2. TicketHub verifies payment using a trusted provider response or signed webhook.
3. A database transaction locks the relevant seat and order records.
4. It verifies that the hold and order still match and that the seat has not been sold to another customer.
5. It marks the order and order item as confirmed, changes the seat status to `SOLD`, and commits.
6. Duplicate payment notifications are recognized through provider references and idempotency keys.

Payment processing and database transactions cannot normally be one shared atomic transaction. If payment succeeds but the application fails before recording confirmation, reconciliation must detect the successful payment and safely complete the order or initiate a refund according to the business policy.

### 5.3 Expired holds

A background worker periodically finds expired holds and releases seats only when the seat is still held by that hold and the expiry has passed.

The worker must lock the relevant rows and recheck the current state before changing inventory. This prevents an old expiry job from releasing a seat that has since been re-held or sold.

### 5.4 Multiple protections

TicketHub combines:
- Row-level locks for concurrent seat allocation.
- Database transactions for atomic state changes.
- Unique constraints for seat identity and active order items.
- Idempotency keys for repeated client requests.
- Verified payment callbacks and reconciliation.
- Short, server-controlled holds and safe expiry handling.

The database remains the final authority on inventory. Caches and browser interfaces must never be allowed to decide whether a sale is valid.

## 6. Architecture

### 6.1 Architecture diagram

```text
                         CUSTOMERS
                             |
                             v
                      +--------------+
                      | DNS / HTTPS  |
                      +--------------+
                             |
                             v
                      +--------------+
                      | CDN          |
                      | Static Assets|
                      +--------------+
                             |
                             v
                  +-----------------------+
                  | WAF / Rate Limiter    |
                  | Virtual Waiting Room  |
                  +-----------------------+
                             |
                             v
                  +-----------------------+
                  | Redundant Load        |
                  | Balancer               |
                  +-----------------------+
                       /             \
                      v               v
               +-------------+ +-------------+
               | API Server 1| | API Server 2|
               +-------------+ +-------------+
                      \               /
                       \             /
                        v           v
                    +-------------------+
                    | Redis Cache       |
                    | Public Event Data |
                    +-------------------+
                              |
                              v
                    +-------------------+
                    | PostgreSQL Primary|
                    | Seat Inventory    |
                    | Orders / Payments |
                    +-------------------+
                              |
                         Replication
                              |
                              v
                    +-------------------+
                    | Read Replica      |
                    +-------------------+

                API / payment events
                          |
                          v
                    +-------------------+
                    | Durable Queue     |
                    +-------------------+
                          |
                          v
                    +-------------------+
                    | Worker Pool        |
                    | Hold Expiry,       |
                    | Notifications,     |
                    | Payment Reconcile  |
                    +-------------------+

             All critical components -> Monitoring / Alerts
```

### 6.2 Component explanations

**DNS and HTTPS:** Resolve the public domain and encrypt traffic between clients and services.

**CDN:** Delivers static assets and can cache public event information. It must not publicly cache private order details or authoritative seat-hold decisions.

**Web Application Firewall and rate limiter:** Filter malicious traffic, apply per-user and per-IP limits, and protect API capacity from abuse.

**Virtual waiting room:** Controls admission during major sales. It issues queue tokens, admits users at a measured rate, and applies transparent rules to prevent uncontrolled traffic from overwhelming checkout.

**Load balancer:** Routes requests to healthy API servers and avoids relying on a single application instance.

**API servers:** Implement event browsing, seat holds, order management, authorization, validation, and checkout. They remain stateless so that additional instances can be added quickly.

**Redis cache:** Stores suitable public event data and other low-risk read results. Seat allocation and purchase correctness are always decided by PostgreSQL.

**PostgreSQL primary:** Stores authoritative seats, holds, orders, and payment state. Transactions, row-level locks, and constraints protect inventory.

**Read replica:** Serves suitable read-heavy queries such as event or order-history reads when consistency requirements allow. Seat purchase decisions and other consistency-sensitive operations use the primary.

**Durable queue and workers:** Process hold expiry, notifications, and payment reconciliation asynchronously. Jobs use retries, idempotency, and dead-letter handling.

**Monitoring and alerts:** Track latency, errors, queue depth, seat conflicts, database saturation, payment failures, and replica lag. Alert operators when sale performance or correctness is at risk.

### 6.3 How the architecture survives the big sale

1. The waiting room controls how many buyers enter the API at once.
2. The CDN serves static assets without sending every asset request to the backend.
3. Event descriptions are cached to reduce repeated database reads.
4. Multiple API servers scale horizontally behind a load balancer.
5. Short database transactions keep seat allocation decisions serialized without holding locks during payment-provider network calls.
6. PostgreSQL remains the authoritative inventory system.
7. Durable queues handle noncritical background work without blocking the checkout response.
8. Rate limits and purchase limits reduce abusive traffic and automated hoarding.
9. Monitoring identifies overload early, allowing operators to adjust admission rates.
10. Redundant instances, database recovery procedures, and backups reduce downtime risk.

A waiting room cannot create more seats. Once 20,000 seats have been sold, the remaining buyers must receive clear unavailable messages or be offered a legitimate waitlist if the business supports one.

## 7. Trade-offs

### Trade-off 1: Strong inventory consistency versus throughput

**Choice:** Use PostgreSQL transactions and row-level locks for seat holds and sales.

**Benefit:** Competing buyers cannot both successfully allocate the same seat.

**Cost:** Contention increases when many customers target the same event or seat, and transactions take time.

**Mitigation:** Keep transactions short, lock only the required rows, avoid calling the payment provider while holding database locks, and control checkout admission through the waiting room.

Correct inventory is more important than accepting every request instantly.

### Trade-off 2: Fair waiting room versus immediate access

**Choice:** Use a virtual waiting room for high-demand events.

**Benefit:** Prevents a large burst from overwhelming the API and gives the sale a consistent admission policy.

**Cost:** Buyers wait longer and may perceive the queue as inconvenient. Queue tokens and admission logic add complexity.

**Mitigation:** Publish sale rules, provide estimated queue status when feasible, use rate limits consistently, and ensure queue infrastructure is resilient.

### Trade-off 3: Cache performance versus freshness

**Choice:** Cache public event information but treat seat availability as a changing snapshot.

**Benefit:** Reduces read load and improves page response times.

**Cost:** Users may briefly see outdated availability.

**Mitigation:** Use short cache lifetimes for changing data, invalidate relevant entries after inventory changes, and always revalidate a seat in the database when a hold is requested.

### Trade-off 4: Fast payment flow versus reliable confirmation

**Choice:** Process payments through a provider and use idempotent callbacks, background reconciliation, and durable records.

**Benefit:** Payment network delays do not require long-running database transactions, and failures can be recovered.

**Cost:** The order may temporarily show `PROCESSING`, and reconciliation logic is more complicated.

**Mitigation:** Use provider transaction references, idempotency keys, retries with backoff, and a reconciliation worker that can safely resolve uncertain outcomes.

## 8. Single points of failure

A single point of failure (SPOF) is a component whose failure can interrupt a critical system function.

| Risk | Mitigation |
|---|---|
| One API server fails | Run multiple stateless API instances across availability zones. |
| Load balancer fails | Use a managed or redundant load-balancing service. |
| Primary database fails | Configure high availability and tested failover; keep independent backups. |
| Cache fails | Fall back to controlled database reads and protect the primary from overload. |
| Queue fails | Use a durable, replicated queue and alert on failed publishing or growing backlog. |
| Worker fails | Run multiple workers and retry idempotent jobs. |
| Waiting room fails | Deploy redundantly, define safe admission limits, and avoid opening uncontrolled traffic during failure. |
| Payment provider is unavailable | Keep orders pending, retry safely, reconcile status, and do not issue confirmed tickets without verified payment. |
| DNS or a whole availability zone fails | Use reliable managed DNS and distribute critical services across zones; plan for regional recovery. |
| Configuration or credential compromise | Use least privilege, managed secrets, rotation, audit logs, and tested incident procedures. |

Backups, replicas, and redundancy reduce risk but do not eliminate it. Replication can propagate accidental changes, and a shared configuration error can affect multiple instances. Recovery procedures must be tested before a major sale.

## 9. Conclusion

TicketHub must be designed around both scale and correctness. The normal workload is manageable, but a popular concert can create thousands of API requests per second and demand ten times more seats than are available.

The design combines a virtual waiting room, horizontally scalable API servers, caching, and a durable background-processing system with PostgreSQL transactions and constraints. Most importantly, seat holds and sales are serialized in the database, preventing double-booking even when buyers compete for the same seat.

The estimates are initial planning assumptions. Load tests, failure drills, security reviews, and real operational metrics are needed before using this design for an actual high-demand ticket sale.