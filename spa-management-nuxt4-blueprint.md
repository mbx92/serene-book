# Spa Management System — Technical Specification

## 1. Overview

Aplikasi ini adalah **Web SPA Management System** untuk mengelola alur bisnis layanan therapist/home service yang sebelumnya dijalankan melalui WhatsApp.

Alur utama bisnis:

```text
Customer
  ↓
Order via WhatsApp / Booking Form
  ↓
Owner / Customer Service
  ↓
Assign order ke lokasi/cabang
  ↓
Admin lokasi
  ↓
Assign therapist
  ↓
Therapist menerima job
  ↓
On The Way
  ↓
Arrived
  ↓
Treatment Started
  ↓
Treatment Completed
  ↓
Payment
  ↓
Order Closed
```

Tujuan sistem:

- Menjadikan sistem sebagai **single source of truth** untuk semua order.
- Mengurangi koordinasi manual melalui WhatsApp.
- Mempermudah dispatch order ke masing-masing lokasi.
- Mengetahui availability dan workload therapist.
- Menyimpan histori assignment dan perubahan status.
- Menyediakan dashboard operasional dan laporan.
- Menjadi fondasi untuk integrasi WhatsApp API dan online booking.

---

# 2. Technology Stack

## Frontend + Backend

- **Nuxt.js 4**
- Full **JavaScript**
- Tidak menggunakan TypeScript
- Vue 3 Composition API
- Nuxt Server API / Nitro

## Styling

- **Tailwind CSS v4**

## Database

- **PostgreSQL**

## ORM

- **Drizzle ORM**
- `drizzle-kit` untuk migration

## Authentication

Rekomendasi:

- Nuxt Auth Utils / custom session auth
- HTTP-only cookie
- Password hashing menggunakan `argon2` atau `bcrypt`

## Validation

Rekomendasi:

- Zod

Walaupun project menggunakan JavaScript, Zod tetap dapat digunakan untuk runtime validation.

## Optional Supporting Libraries

- Pinia — global client state bila diperlukan
- VueUse — utility composables
- Day.js — date & time handling
- Lucide Vue Next — icons
- Nuxt UI bila ingin mempercepat pembuatan component admin

---

# 3. Application Architecture

Nuxt digunakan sebagai full-stack framework.

```text
Browser
   ↓
Nuxt Pages / Components
   ↓
Nuxt Server API
   ↓
Service Layer
   ↓
Drizzle ORM
   ↓
PostgreSQL
```

Tidak perlu membuat backend Express terpisah pada MVP.

Struktur:

```text
Nuxt 4
├── Client
│   ├── pages
│   ├── components
│   ├── composables
│   └── stores
│
└── Server
    ├── api
    ├── services
    ├── repositories
    ├── database
    └── utils
```

---

# 4. User Roles

Sistem minimal mempunyai role berikut.

## Super Admin / Owner

Hak akses:

- Melihat semua lokasi.
- Melihat seluruh order.
- Membuat order.
- Assign order ke lokasi.
- Melihat semua therapist.
- Mengatur service dan harga.
- Melihat payment.
- Melihat laporan.
- Membuat user.
- Mengatur role dan permission.

## Customer Service / Dispatcher

Hak akses:

- Membuat customer.
- Membuat order.
- Update customer.
- Assign order ke lokasi.
- Melihat status order.
- Melihat availability therapist.
- Tidak dapat mengubah setting sistem.

## Location Admin

Hak akses:

- Hanya melihat order untuk lokasi sendiri.
- Assign therapist.
- Reassign therapist.
- Melihat therapist lokasi.
- Mengubah status tertentu.
- Mengelola availability therapist.
- Melihat laporan lokasi sendiri.

## Therapist

Hak akses:

- Melihat job yang diberikan kepadanya.
- Accept job.
- Reject job.
- On The Way.
- Arrived.
- Start Treatment.
- Complete Treatment.
- Melihat job history sendiri.

---

# 5. Order Lifecycle

Gunakan status eksplisit.

```text
NEW
↓
CONFIRMED
↓
ASSIGNED_LOCATION
↓
ASSIGNED_THERAPIST
↓
ACCEPTED
↓
ON_THE_WAY
↓
ARRIVED
↓
IN_PROGRESS
↓
COMPLETED
↓
PAID
↓
CLOSED
```

Status alternatif:

```text
CANCELLED_BY_CUSTOMER
CANCELLED_BY_ADMIN
THERAPIST_REJECTED
NO_THERAPIST_AVAILABLE
```

Status sebaiknya tidak langsung dioverwrite tanpa histori.

Setiap perubahan wajib dicatat ke:

```text
order_status_logs
```

---

# 6. Database Design

## Core Tables

```text
users
roles
user_roles

locations

customers
customer_addresses

services
service_prices

therapists
therapist_locations
therapist_schedules

orders
order_items
order_assignments
order_status_logs

payments

notifications
```

---

# 7. Database Schema

## roles

```text
id
name
code
created_at
updated_at
```

Contoh code:

```text
SUPER_ADMIN
OWNER
CUSTOMER_SERVICE
LOCATION_ADMIN
THERAPIST
```

---

## users

```text
id
name
email
phone
password_hash
is_active
created_at
updated_at
```

---

## user_roles

```text
id
user_id
role_id
location_id nullable
created_at
```

`location_id` berguna untuk role seperti location admin.

---

## locations

```text
id
name
code
phone
address
latitude
longitude
timezone
is_active
created_at
updated_at
```

---

## customers

```text
id
name
phone
email nullable
notes nullable
created_at
updated_at
```

Phone dapat digunakan sebagai primary business identifier.

---

## customer_addresses

```text
id
customer_id
label
address
latitude
longitude
notes
is_default
created_at
updated_at
```

Contoh label:

```text
Home
Villa
Hotel
Office
```

---

## services

```text
id
name
code
description
duration_minutes
is_active
created_at
updated_at
```

Contoh:

```text
Balinese Massage 60 min
Balinese Massage 90 min
Deep Tissue Massage
Couple Massage
```

---

## service_prices

Harga dipisahkan agar mudah dibuat fleksibel per lokasi.

```text
id
service_id
location_id nullable
price
currency
is_active
created_at
updated_at
```

---

## therapists

```text
id
user_id
employee_code
gender nullable
is_active
notes
created_at
updated_at
```

---

## therapist_locations

Satu therapist dapat bekerja di lebih dari satu lokasi.

```text
id
therapist_id
location_id
is_primary
created_at
```

---

## therapist_schedules

```text
id
therapist_id
location_id
schedule_date
start_time
end_time
status
notes
created_at
updated_at
```

Status:

```text
AVAILABLE
BOOKED
OFF
LEAVE
```

---

# 8. Orders

## orders

```text
id
order_number

customer_id
customer_address_id nullable
location_id nullable

booking_date
booking_time

address_snapshot
latitude
longitude

subtotal
discount
transport_fee
tax
total

payment_status
order_status

source
notes

created_by
created_at
updated_at
```

Source:

```text
WHATSAPP
WEB
PHONE
WALK_IN
ADMIN
```

Payment status:

```text
UNPAID
PARTIAL
PAID
REFUNDED
```

---

## order_items

```text
id
order_id
service_id

service_name_snapshot
duration_minutes
price
qty
subtotal

notes
created_at
```

Snapshot penting supaya perubahan nama atau harga service tidak mengubah data transaksi lama.

---

# 9. Therapist Assignment

Jangan menyimpan hanya satu `therapist_id` di tabel `orders`.

Gunakan tabel:

## order_assignments

```text
id
order_id
therapist_id

assigned_by
assigned_at

response_status
responded_at

accepted_at
rejected_at

rejection_reason nullable

is_active

created_at
updated_at
```

Response status:

```text
PENDING
ACCEPTED
REJECTED
CANCELLED
REASSIGNED
```

Contoh scenario:

```text
Order #1001
    ↓
Assign Ayu
    ↓
Ayu Reject
    ↓
Assign Made
    ↓
Made Accept
```

Seluruh history tetap tersimpan.

---

# 10. Order Status Logs

## order_status_logs

```text
id
order_id

from_status
to_status

changed_by
notes

created_at
```

Contoh:

```text
NEW → CONFIRMED
CONFIRMED → ASSIGNED_LOCATION
ASSIGNED_LOCATION → ASSIGNED_THERAPIST
ASSIGNED_THERAPIST → ACCEPTED
ACCEPTED → ON_THE_WAY
ON_THE_WAY → ARRIVED
ARRIVED → IN_PROGRESS
IN_PROGRESS → COMPLETED
```

---

# 11. Payments

## payments

```text
id
order_id

amount
payment_method
payment_reference nullable

status

paid_at nullable
created_by

created_at
updated_at
```

Payment method:

```text
CASH
BANK_TRANSFER
QRIS
CARD
ONLINE_PAYMENT
```

Status:

```text
PENDING
SUCCESS
FAILED
REFUNDED
```

---

# 12. Notifications

## notifications

```text
id
user_id
type
title
message
data
read_at
created_at
```

Contoh notification:

```text
NEW_ORDER
ORDER_ASSIGNED
THERAPIST_ASSIGNED
THERAPIST_ACCEPTED
THERAPIST_REJECTED
ORDER_CANCELLED
PAYMENT_RECEIVED
```

---

# 13. Recommended Project Structure

Nuxt 4 menggunakan struktur `app`.

```text
project/
│
├── app/
│   ├── assets/
│   │   └── css/
│   │       └── main.css
│   │
│   ├── components/
│   │   ├── ui/
│   │   ├── layout/
│   │   ├── order/
│   │   ├── customer/
│   │   ├── therapist/
│   │   └── dashboard/
│   │
│   ├── composables/
│   │   ├── useAuth.js
│   │   ├── useOrders.js
│   │   ├── useCustomers.js
│   │   └── useNotifications.js
│   │
│   ├── layouts/
│   │   ├── default.vue
│   │   ├── auth.vue
│   │   └── therapist.vue
│   │
│   ├── middleware/
│   │   ├── auth.js
│   │   ├── guest.js
│   │   └── role.js
│   │
│   ├── pages/
│   │
│   └── app.vue
│
├── server/
│   ├── api/
│   │
│   ├── database/
│   │   ├── index.js
│   │   ├── schema/
│   │   └── migrations/
│   │
│   ├── repositories/
│   │
│   ├── services/
│   │
│   ├── utils/
│   │
│   └── middleware/
│
├── shared/
│   ├── constants/
│   ├── schemas/
│   └── utils/
│
├── public/
│
├── drizzle.config.js
├── nuxt.config.js
├── package.json
└── .env
```

---

# 14. Database Folder

```text
server/database/
├── index.js
└── schema/
    ├── users.js
    ├── roles.js
    ├── locations.js
    ├── customers.js
    ├── services.js
    ├── therapists.js
    ├── schedules.js
    ├── orders.js
    ├── assignments.js
    ├── payments.js
    └── notifications.js
```

`index.js`:

```js
import { drizzle } from 'drizzle-orm/node-postgres'
import pg from 'pg'

const { Pool } = pg

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
})

export const db = drizzle(pool)
```

---

# 15. Example Drizzle Schema

Contoh `server/database/schema/locations.js`:

```js
import {
  pgTable,
  serial,
  varchar,
  text,
  boolean,
  timestamp,
  decimal
} from 'drizzle-orm/pg-core'

export const locations = pgTable('locations', {
  id: serial('id').primaryKey(),

  name: varchar('name', { length: 150 }).notNull(),

  code: varchar('code', { length: 50 })
    .notNull()
    .unique(),

  phone: varchar('phone', { length: 50 }),

  address: text('address'),

  latitude: decimal('latitude', {
    precision: 10,
    scale: 7
  }),

  longitude: decimal('longitude', {
    precision: 10,
    scale: 7
  }),

  timezone: varchar('timezone', {
    length: 100
  }).default('Asia/Makassar'),

  isActive: boolean('is_active')
    .default(true)
    .notNull(),

  createdAt: timestamp('created_at')
    .defaultNow()
    .notNull(),

  updatedAt: timestamp('updated_at')
    .defaultNow()
    .notNull()
})
```

---

# 16. Order Number

Gunakan format yang mudah dibaca.

Contoh:

```text
ORD-20260926-0001
```

Atau per lokasi:

```text
SMY-20260926-001
CGU-20260926-004
UBD-20260926-002
```

Jangan gunakan database ID sebagai nomor order yang dilihat customer.

---

# 17. Pages

## Authentication

```text
/login
/logout
```

---

## Dashboard

```text
/dashboard
```

Widget:

```text
Orders Today
New Orders
Waiting Assignment
On The Way
In Progress
Completed
Revenue Today
Available Therapists
```

---

## Orders

```text
/orders
/orders/new
/orders/:id
/orders/:id/edit
```

Order list filter:

```text
Date
Location
Status
Therapist
Payment Status
Source
Search customer
```

---

## Customers

```text
/customers
/customers/new
/customers/:id
/customers/:id/edit
```

Customer detail:

```text
Profile
Addresses
Order history
Total orders
Total spending
Notes
```

---

## Locations

```text
/locations
/locations/new
/locations/:id
/locations/:id/edit
```

---

## Therapists

```text
/therapists
/therapists/new
/therapists/:id
/therapists/:id/edit
```

---

## Therapist Schedule

```text
/schedules
```

Views:

```text
Daily
Weekly
By Location
By Therapist
```

---

## Services

```text
/services
/services/new
/services/:id/edit
```

---

## Payments

```text
/payments
```

---

## Reports

```text
/reports
/reports/orders
/reports/revenue
/reports/therapists
/reports/locations
```

---

# 18. Therapist Mobile Pages

Therapist interface harus mobile-first.

```text
/therapist
/therapist/jobs
/therapist/jobs/:id
/therapist/history
/therapist/profile
```

Contoh job card:

```text
BOOKING #ORD-10231

16:00
Balinese Massage
90 minutes

Customer
John Doe

Location
Villa Example
Seminyak

[Accept Job]
[Reject]
```

Setelah accept:

```text
[On The Way]
```

Kemudian:

```text
[Arrived]
```

Kemudian:

```text
[Start Treatment]
```

Kemudian:

```text
[Complete Treatment]
```

---

# 19. Dispatch Dashboard

Salah satu halaman terpenting.

```text
/dispatch
```

Layout:

```text
┌────────────────────────────────────────────────────────────┐
│ Dispatch Dashboard                                        │
├──────────────────────────────┬─────────────────────────────┤
│ Unassigned Orders            │ Therapist Availability      │
│                              │                             │
│ #1021 — 14:00                │ ● Ayu   Available           │
│ Seminyak                     │ ● Made  Available           │
│ Massage 90 min               │ ● Putu  On Job              │
│                              │ ○ Wayan Off                 │
│ [Assign Therapist]           │                             │
│                              │                             │
│ #1022 — 14:30                │                             │
│ Canggu                       │                             │
│ Massage 60 min               │                             │
│ [Assign Therapist]           │                             │
└──────────────────────────────┴─────────────────────────────┘
```

---

# 20. API Design

Gunakan REST API melalui Nitro.

Base:

```text
/api
```

---

## Auth

```text
POST /api/auth/login
POST /api/auth/logout
GET  /api/auth/me
```

---

## Customers

```text
GET    /api/customers
POST   /api/customers
GET    /api/customers/:id
PATCH  /api/customers/:id
DELETE /api/customers/:id
```

---

## Locations

```text
GET    /api/locations
POST   /api/locations
GET    /api/locations/:id
PATCH  /api/locations/:id
```

---

## Therapists

```text
GET    /api/therapists
POST   /api/therapists
GET    /api/therapists/:id
PATCH  /api/therapists/:id
```

---

## Services

```text
GET    /api/services
POST   /api/services
GET    /api/services/:id
PATCH  /api/services/:id
```

---

## Orders

```text
GET    /api/orders
POST   /api/orders
GET    /api/orders/:id
PATCH  /api/orders/:id
```

---

## Location Assignment

```text
POST /api/orders/:id/assign-location
```

Body:

```json
{
  "locationId": 2
}
```

---

## Therapist Assignment

```text
POST /api/orders/:id/assign-therapist
```

Body:

```json
{
  "therapistId": 12
}
```

---

## Therapist Response

```text
POST /api/orders/:id/accept
POST /api/orders/:id/reject
```

---

## Job Status

```text
POST /api/orders/:id/on-the-way
POST /api/orders/:id/arrived
POST /api/orders/:id/start
POST /api/orders/:id/complete
POST /api/orders/:id/cancel
```

---

# 21. Service Layer

API endpoint jangan mengandung terlalu banyak business logic.

Contoh:

```text
server/api/orders/[id]/assign-therapist.post.js
```

Hanya menangani:

```text
authentication
validation
call service
return response
```

Business logic di:

```text
server/services/order-assignment.service.js
```

Contoh:

```js
export async function assignTherapist({
  orderId,
  therapistId,
  assignedBy
}) {
  // validate order

  // validate therapist

  // validate location

  // validate availability

  // deactivate previous assignment

  // create new assignment

  // update order status

  // create order status log

  // create notification
}
```

---

# 22. Repository Layer

Database query sebaiknya dipisahkan.

```text
server/repositories/order.repository.js
server/repositories/customer.repository.js
server/repositories/therapist.repository.js
```

Contoh:

```js
export async function findOrderById(id) {
  return db.query.orders.findFirst({
    where: eq(orders.id, id)
  })
}
```

Keuntungan:

- API lebih bersih.
- Query mudah diuji.
- Mudah refactor.
- Business logic tidak terikat langsung ke ORM.

---

# 23. Validation

Gunakan schema validation.

Contoh:

```js
import { z } from 'zod'

export const createOrderSchema = z.object({
  customerId: z.number(),

  locationId: z.number().nullable(),

  bookingDate: z.string(),

  bookingTime: z.string(),

  address: z.string().min(3),

  services: z.array(
    z.object({
      serviceId: z.number(),
      qty: z.number().min(1)
    })
  )
})
```

---

# 24. Tailwind CSS v4

Contoh main stylesheet:

```css
@import "tailwindcss";
```

File:

```text
app/assets/css/main.css
```

`nuxt.config.js`:

```js
export default defineNuxtConfig({
  css: [
    '~/assets/css/main.css'
  ]
})
```

Gunakan design system sederhana.

Spacing dan visual state harus konsisten.

Contoh order status:

```text
NEW
CONFIRMED
ASSIGNED
ON THE WAY
IN PROGRESS
COMPLETED
CANCELLED
```

Gunakan badge component yang reusable.

---

# 25. UI Components

```text
components/ui/
├── Button.vue
├── Input.vue
├── Select.vue
├── Modal.vue
├── Badge.vue
├── Card.vue
├── Table.vue
├── Dropdown.vue
├── Pagination.vue
├── DatePicker.vue
└── EmptyState.vue
```

Business components:

```text
components/order/
├── OrderCard.vue
├── OrderStatusBadge.vue
├── OrderTimeline.vue
├── OrderAssignment.vue
└── OrderPayment.vue
```

---

# 26. Authentication Flow

Login:

```text
User
 ↓
POST /api/auth/login
 ↓
Check email
 ↓
Verify password
 ↓
Create session
 ↓
Set HTTP-only cookie
 ↓
Redirect dashboard
```

Session minimal:

```text
userId
role
locationId
```

Jangan menyimpan authorization hanya di frontend.

Semua server API tetap harus melakukan permission check.

---

# 27. Authorization

Contoh permission logic:

```text
SUPER_ADMIN
→ all access

CUSTOMER_SERVICE
→ customers
→ orders
→ assign location

LOCATION_ADMIN
→ orders within own location
→ therapists within own location
→ therapist assignment

THERAPIST
→ only assigned jobs
→ update allowed job status
```

---

# 28. Multi-location Security

Setiap query Location Admin harus difilter berdasarkan lokasi user.

Jangan hanya melakukan filter di frontend.

Contoh:

```js
const locationId = event.context.auth.locationId
```

Query:

```text
WHERE orders.location_id = current_user.location_id
```

Ini penting untuk mencegah user lokasi A membaca order lokasi B.

---

# 29. Booking Conflict

Sistem harus mencegah double booking therapist.

Contoh:

```text
Therapist Ayu

14:00 — 15:30
Order A
```

Maka order:

```text
15:00 — 16:30
```

tidak boleh diberikan ke Ayu.

Perhitungan slot:

```text
start = booking datetime
end = start + total duration
```

Conflict:

```text
new_start < existing_end
AND
new_end > existing_start
```

---

# 30. Therapist Availability

Availability jangan hanya:

```text
is_available = true
```

Availability sebaiknya dihitung dari:

```text
schedule
+
active job
+
working location
+
leave/off status
```

---

# 31. Real-time Updates

MVP dapat menggunakan polling.

Contoh:

```text
refresh dashboard setiap 15-30 detik
```

Setelah aplikasi stabil dapat menggunakan:

- Server Sent Events
- WebSocket
- Pusher
- Ably
- Supabase Realtime

Tidak wajib untuk MVP.

---

# 32. WhatsApp Strategy

## Phase 1

WhatsApp tetap manual.

Customer:

```text
WhatsApp
   ↓
CS
   ↓
Create Order di SPA
```

---

## Phase 2

Public booking form.

```text
/book
```

Form:

```text
Name
WhatsApp
Service
Date
Time
Hotel / Villa
Address
Notes
```

Setelah submit:

```text
Order Status = NEW
```

---

## Phase 3

WhatsApp Business API.

Contoh automation:

```text
Booking confirmation
Therapist assigned
Therapist on the way
Booking completed
Payment reminder
```

---

# 33. Dashboard Metrics

Owner dashboard:

```text
Orders Today

New Orders

Unassigned Orders

Active Jobs

Completed Today

Cancelled Today

Revenue Today

Revenue This Month

Therapist Utilization

Orders per Location
```

---

# 34. Reports

## Order Report

Filter:

```text
Date Range
Location
Therapist
Service
Status
Source
```

---

## Revenue Report

```text
Gross Revenue
Discount
Transport Fee
Refund
Net Revenue
```

---

## Therapist Report

```text
Assigned Jobs
Accepted Jobs
Rejected Jobs
Completed Jobs
Total Service Hours
Revenue Generated
```

---

## Location Report

```text
Orders
Completed
Cancelled
Revenue
Average Order Value
Therapist Utilization
```

---

# 35. Audit Requirements

Simpan:

```text
created_by
updated_by
created_at
updated_at
```

untuk data penting.

Aktivitas kritikal juga sebaiknya memiliki log:

```text
order created
location assigned
therapist assigned
therapist rejected
payment changed
order cancelled
```

---

# 36. Environment Variables

`.env`:

```env
DATABASE_URL=postgresql://user:password@localhost:5432/spa_management

SESSION_SECRET=your-secret

APP_URL=http://localhost:3000
```

Jangan commit `.env`.

---

# 37. Drizzle Configuration

`drizzle.config.js`:

```js
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './server/database/schema/*.js',

  out: './server/database/migrations',

  dialect: 'postgresql',

  dbCredentials: {
    url: process.env.DATABASE_URL
  }
})
```

---

# 38. Suggested Package Dependencies

```bash
npm install drizzle-orm pg zod argon2
```

Development:

```bash
npm install -D drizzle-kit
```

Tailwind CSS v4 disesuaikan dengan integrasi Nuxt yang digunakan pada project.

---

# 39. MVP Scope

## Phase 1 — Foundation

- Nuxt setup
- PostgreSQL
- Drizzle
- Tailwind CSS v4
- Authentication
- User & Role
- Location

## Phase 2 — Master Data

- Customer
- Therapist
- Service
- Price
- Schedule

## Phase 3 — Core Operation

- Create Order
- Assign Location
- Assign Therapist
- Therapist Accept / Reject
- Job Status
- Order Timeline

## Phase 4 — Finance

- Payment
- Payment status
- Daily revenue
- Basic reporting

## Phase 5 — Automation

- Public booking
- WhatsApp integration
- Notification
- Auto assignment recommendation

---

# 40. Recommended MVP Workflow

```text
Customer chat WhatsApp
       ↓
CS Create Order
       ↓
Order = NEW
       ↓
CS Confirm
       ↓
Assign Location
       ↓
Location Admin Notification
       ↓
Admin Assign Therapist
       ↓
Therapist Notification
       ↓
Therapist Accept
       ↓
On The Way
       ↓
Arrived
       ↓
Treatment Start
       ↓
Treatment Complete
       ↓
Payment
       ↓
Closed
```

---

# 41. Future Features

Setelah MVP stabil:

```text
WhatsApp Business API
Online Booking
Online Payment
GPS Therapist Tracking
Google Maps
Automatic Therapist Recommendation
Auto Dispatch
Customer Portal
Voucher
Promo Code
Therapist Commission
Tips
Membership
Package Treatment
Hotel / Villa Partner
Referral
Multi Currency
Financial Reporting
Customer Feedback
Review & Rating
Push Notification
PWA
```

---

# 42. Development Principles

## Keep Business Logic in Server

Jangan mengandalkan frontend untuk aturan bisnis.

## Preserve History

Jangan menghapus histori assignment atau perubahan status.

## Snapshot Transaction Data

Nama service dan harga harus disimpan sebagai snapshot pada order.

## Server-side Authorization

Role dan location permission harus selalu diperiksa server.

## Mobile First for Therapist

Interface therapist harus cepat dan sederhana.

## Desktop First for Dispatch

Admin dan owner lebih nyaman menggunakan dashboard lebar.

## Avoid Premature Complexity

Untuk MVP:

```text
Nuxt
+
Nitro API
+
PostgreSQL
+
Drizzle
```

sudah cukup.

Tidak perlu microservices.

---

# 43. Definition of Done — MVP

MVP dianggap berhasil jika sistem sudah dapat menangani workflow berikut tanpa koordinasi internal melalui chat:

```text
1. CS membuat customer.
2. CS membuat order.
3. Order diberikan ke lokasi.
4. Admin lokasi menerima order.
5. Admin memilih therapist.
6. Therapist menerima job.
7. Therapist update perjalanan.
8. Therapist memulai treatment.
9. Therapist menyelesaikan treatment.
10. Admin mencatat payment.
11. Owner melihat transaksi di dashboard.
12. Semua perubahan tersimpan dalam history.
```

Jika 12 langkah tersebut sudah berjalan stabil, sistem sudah cukup kuat untuk menggantikan sebagian besar proses operasional manual yang sebelumnya dilakukan melalui WhatsApp.
