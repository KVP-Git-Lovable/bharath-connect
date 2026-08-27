# Quickapp

Project Name: Quickapp

Build a field force management app called "Quickapp". The UI, navigation, and layout must closely replicate the style of a mobile-first sales force app with the following design patterns:

Navigation & Layout (must match exactly):

Bottom navigation bar on mobile with 4-5 main tabs (Home, Visits, Attendance, Expenses, More)

Sidebar navigation on desktop using shadcn Sidebar component with collapsible mini mode (w-14 icons only)

Top header bar with user avatar, greeting, and notification bell

Single-column, card-based layouts — no data tables on mobile. Use chips, badges, and bottom sheets instead

Mobile-first responsive design (Capacitor-ready for Android/iOS)

Authentication flow at /auth route with email/password login

Role-based routing: field users → /dashboard, admins → /admin

Use shadcn/ui components throughout, Tailwind CSS with semantic design tokens (no hardcoded colors), React Router for routing, React Query for data fetching, Sonner for toast notifications

All colors must use HSL CSS variables from the design system (--primary, --background, --foreground, --muted, --accent, etc.)

Immediate visual feedback for status changes (optimistic UI updates for check-in/check-out, etc.)

Dashboard / Home Page:

Greeting banner with user name and current date

Quick action cards: Check In, Plan Visit, Submit Expense

Today's summary: attendance status, visits planned vs completed, pending approvals count

Target vs actual progress widget (circular or bar chart)

Recent activity feed

Core Modules (Field User):

Attendance

Check-in/check-out with GPS location capture and optional photo capture

Face verification status tracking

Monthly calendar view with color-coded round indicators: Present (Green), Absent (Red), On Leave (Orange), Half Day (Green/Orange split-gradient), Holiday (Blue), Week Off (Grey)

Calendar and summary stats (Present days, Absent days, Total hours) in a single compact white-background card above list view

Detailed list view of daily attendance records

Date filtering by monthly or custom date range (no "Today" or "This Week" presets)

Supabase tables: attendance (check_in_time, check_out_time, location, photo_url, status, total_hours), holidays

GPS Day Tracking

Real-time route display on a Leaflet map (react-leaflet)

Road-following route geometry using OSRM via Supabase Edge Function (for CORS)

Multi-day/weekly view with color-coded routes per day

Interactive legend to toggle day visibility

Path sequence: attendance check-in location → completed visits → pending visits

Supabase tables: gps_tracks (user_id, latitude, longitude, timestamp, accuracy)

Visits

Visit planning and execution with status flow: planned → in-progress → productive/unproductive

Check-in/check-out with GPS location and timestamps

Visit details: notes, photos, order capture

Beat plan integration for daily route planning

Retailer/site master list with search and filters

Productivity tracking with daily/weekly summary

Card-based visit list on mobile with status chips and swipe actions

Supabase tables: visits, retailers, beats, beat_plans

Expenses

Submit daily expenses with categories (Travel, Food, Accommodation, Miscellaneous)

Photo upload for bills/receipts via Supabase Storage

Beat-based travel allowance auto-calculation

Additional expense entries with custom categories

Monthly expense summary with category breakdown

Expense submission with approval workflow (pending → approved/rejected)

Card-based expense list with category icons and amount badges

Supabase tables: expenses, expense_categories, additional_expenses, beat_allowances

Admin Controls (accessible from sidebar/More menu for admin role):

User Management

Create/edit users with mandatory fields: Full Name, Phone Number, Email, Primary Manager

Role assignment (admin, field_user, manager)

Organizational hierarchy with dual view: collapsible vertical list AND visual horizontal org-chart tree with avatars and role-colored rings

Manager selection via searchable combobox

"Login as User" capability for admins

Password reset functionality

User status management (active/inactive)

Supabase tables: profiles, employees, user_roles

Attendance Management

Team attendance overview with daily/weekly/monthly filters

Approve/reject regularization requests

Leave management: leave types configuration, leave balance tracking (opening_balance, used_balance, remaining_balance as generated column), leave application approval with multi-level hierarchy

Leave balance immediately deducted on application (not on approval), restored on rejection/cancellation via database trigger

Holiday calendar management (add/edit/delete holidays)

Working days configuration

Attendance policy settings

Supabase tables: attendance, leave_types, leave_balance, leave_applications, leave_policy, holidays, working_days_config, regularization_requests

Expense Management

Review and approve/reject expense claims from team members

Set expense policies and category-wise limits

View expense reports filtered by user, team, or period

Export expense data to Excel

Dashboard with total pending, approved, rejected counts

GPS Tracking Management

View any team member's GPS trail for any selected date

Team-wide live location overview on a single map

Route history and distance analytics

User selector with searchable dropdown

Technical Requirements:

Supabase for authentication, database (PostgreSQL), file storage, and edge functions

Row Level Security (RLS) on ALL tables — users see own data, managers see direct reports, admins see all

Permission-based access control using security_profiles, user_profiles, and profile_object_permissions tables with CRUD flags

Multi-level approval workflow engine using approval_requests and approval_steps tables with reporting chain

Database triggers for: attendance summary refresh, leave balance updates, visit status auto-update on order

Mobile-first card-based layouts with large tap targets

Framer Motion for page transitions and micro-interactions

All data fetching via React Query with proper cache invalidation

Sonner for all toast notifications

Date handling with date-fns library

Recharts for any charts/graphs

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://build-force-flow.lovable.app
