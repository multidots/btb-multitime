# Multitime: Time Tracking Application

A comprehensive time tracking and project management application built with Next.js 14, React 18, Sanity CMS, and NextAuth.js. Designed for teams to efficiently track billable hours, manage projects, and generate detailed reports.

---

## 📋 Table of Contents

- [Features Overview](#-features-overview)
- [Technology Stack](#-technology-stack)
- [User Roles & Permissions](#-user-roles--permissions)
- [Authentication](#-authentication)
- [Time Tracking](#-time-tracking)
- [Team Management](#-team-management)
- [Project Management](#-project-management)
- [Client Management](#-client-management)
- [Task Management](#-task-management)
- [Reporting](#-reporting)
- [Approval Workflow](#-approval-workflow)
- [Installation](#-installation)
- [Environment Variables](#-environment-variables)
- [Project Structure](#-project-structure)
- [API Reference](#-api-reference)
- [Deployment](#-deployment)
- [Contributing](#-contributing)
- [License](#-license)

---

## 🎯 Features Overview

### Core Features
- **Multi-role Authentication**: Admin, Manager, and User roles with Google OAuth and credentials-based login
- **Time Tracking**: Timer-based and manual time entry with inline editing
- **Week & Day Views**: Flexible timesheet views with navigation
- **Approval Workflow**: Submit, review, and approve time entries
- **Project & Task Management**: Hierarchical project structure with task categorization
- **Team Management**: User profiles, capacity tracking, and hourly rates
- **Client Management**: Client profiles with contact management
- **Comprehensive Reporting**: Time reports, utilization metrics, and exports
- **Real-time Dashboard**: Role-specific dashboards with key metrics

---

## 🏗️ Technology Stack

| Component | Technology |
|-----------|------------|
| **Framework** | Next.js 14 (App Router) |
| **UI Library** | React 18 |
| **Styling** | Tailwind CSS |
| **CMS/Database** | Sanity.io v3 (Content Lake) |
| **Authentication** | NextAuth.js v4 |
| **OAuth Providers** | Google OAuth 2.0 |
| **Charts** | Recharts |
| **Icons** | React Icons (Feather Icons) |
| **Date Handling** | date-fns |
| **Notifications** | React Hot Toast |
| **Export** | XLSX (Excel), CSV generation |

---

## 👥 User Roles & Permissions

### Admin Role
- Full access to all features and data
- Manage users, projects, clients, and tasks
- Access Sanity Studio (if also a Sanity project member)
- View and approve all team members' timesheets
- Generate organization-wide reports
- Configure system settings (UI themes, etc.)
- Archive/delete records

### Manager Role
- View and manage assigned team members
- Approve timesheets for team members
- Access team reports and metrics
- Create and manage projects assigned to them
- Cannot access UI Settings menu
- Cannot manage other managers or admins

### User (Member) Role
- Track personal time entries
- View assigned projects and tasks
- Submit timesheets for approval
- View personal reports and metrics
- Cannot access admin or team management features

---

## 🔐 Authentication 

### Credentials-Based Login
- Email and password authentication
- Secure password hashing with bcryptjs
- Password requirements:
  - Minimum 8 characters
  - At least one uppercase letter (A-Z)
  - At least one lowercase letter (a-z)
  - At least one number (0-9)
  - At least one special character

### Google OAuth Login
- One-click Google sign-in for existing users
- Account linking for users with both credentials and Google
- **Important restrictions**:
  - New users cannot sign up via Google (must use credentials signup first)
  - Existing Google-linked users can log in via Google
  - Existing credentials users can link their Google account
  - Inactive or archived users are denied access

### Password Reset
- Forgot password functionality with email reset links
- Secure token-based password reset
- Only available for credentials-based accounts (not Google-only accounts)

### Session Management
- JWT-based session handling
- Role and user information stored in session
- Automatic session refresh

---

## ⏱️ Time Tracking

### Week View (Default)
- **7-day grid display**: Monday to Sunday layout
- **Project-Task rows**: Each row represents a project-task combination
- **Inline editing**: Click any cell to enter/edit hours
- **Time formats supported**: 
  - Decimal hours (e.g., `1.5`)
  - HH:MM format (e.g., `1:30`)
  - Minutes only (e.g., `90` = 1:30)
- **Daily totals**: Automatic calculation per column
- **Row totals**: Automatic calculation per project-task
- **Week totals**: Grand total for the entire week

### Day View (Calendar)
- **Single day focus**: View and manage entries for selected day
- **Day selector**: Click on day tabs to switch between days
- **Detailed entry list**: Shows all entries with full details
- **Quick navigation**: Previous/Next day buttons

### Navigation Features
- **Previous/Next week/day**: Arrow buttons for navigation
- **Return to today**: Quick link to return to current date
- **Future week support**: Navigate to and track future weeks

### Add Row Feature (Week View)
- **Add Row button**: Opens project-task selection modal
- **Project dropdown**: Select from assigned projects
- **Task dropdown**: Dynamically populated based on selected project
- **Row creation**: Creates empty row for all 7 days of the week
- **Persistence**: Manually added rows persist across page reloads

### Copy Rows Feature
- **Copy from previous week**: Copies project-task rows from the most recent timesheet
- **Available when**: No existing rows or no actual time entries
- **Excludes deleted rows**: Previously deleted rows are not copied
- **One-click operation**: Single button to copy all previous rows

### Time Entry Modal (Day View)
- **Project selection**: Dropdown with assigned projects
- **Task selection**: Filtered by selected project
- **Date picker**: Pre-filled with selected day
- **Hours input**: Manual time entry
- **Notes field**: Optional description for the entry
- **Edit mode**: Modify existing entries
- **Delete option**: Remove entries (with confirmation)

### Inline Cell Editing (Week View)
- **Click to edit**: Click any cell to enter edit mode
- **Keyboard support**: 
  - Enter to save
  - Escape to cancel
- **Validation**: Real-time validation with visual feedback
- **Optimized API calls**: Only saves if value actually changed
- **Auto-create**: Creates new entry if none exists for that cell

### Row Deletion
- **Delete row option**: Remove entire project-task row
- **Deletes all entries**: Removes entries for all days in that row
- **Confirmation dialog**: Prevents accidental deletion
- **Optimistic UI**: Row removed instantly with background deletion
- **Deletion persistence**: Deleted rows excluded from future copies

---

## 👥 Team Management

### Team Overview
- **Member listing**: View all team members with key info
- **Weekly statistics**: Hours tracked per member per week
- **Week navigation**: View stats for different weeks
- **Status indicators**: Active, pending approval, inactive states
- **Search functionality**: Filter members by name or email

### Member Details
- **Profile information**: Name, email, role, department
- **Hourly rate**: Billable rate configuration
- **Weekly capacity**: Expected hours per week
- **Time entries**: View member's entries by week
- **Edit capabilities**: Admins can edit member entries

### Member Actions
- **Pin/Unpin**: Pin important members to top of list
- **Archive**: Soft-delete (can be restored)
- **Delete**: Permanent removal (with confirmation)
- **Edit profile**: Update member information

### Pending Approvals Indicator
- **Visual badge**: Shows when member has pending entries
- **Quick access**: Click to view pending entries for approval

---

## 📁 Project Management

### Project Creation
- **Project name**: Required, unique identifier
- **Project code**: Optional short code
- **Client association**: Link to existing client
- **Description**: Project details and notes
- **Budget**: Time or cost budget settings
- **Status**: Active, On Hold, Completed, Archived

### Project Assignment
- **Team member assignment**: Assign users to projects
- **Manager assignment**: Designate project managers
- **Task assignment**: Link tasks to projects

### Project Features
- **Billable/Non-billable**: Mark entire project as billable
- **Color coding**: Visual identification in reports
- **Time tracking**: View total hours logged
- **Budget tracking**: Compare actual vs. budgeted hours

### Common Tasks Feature
- **Automatic assignment**: Tasks in "Common Tasks" category auto-added to new projects
- **Bidirectional sync**: Project added to task's project list
- **Time saver**: Reduces manual task assignment

---

## 🏢 Client Management

### Client Profile
- **Company name**: Client organization name
- **Industry**: Business sector classification
- **Address**: Physical location details
- **Notes**: Additional client information
- **Active/Inactive status**: Toggle client availability

### Contact Management
- **Multiple contacts**: Add multiple contacts per client
- **Primary contact**: Designate one primary contact
  - Only one primary allowed (enforced)
  - Automatic unchecking of others when primary selected
- **Contact details**: Name, email, phone, position
- **Contact validation**: Required fields enforcement

### Client Actions
- **Edit client**: Update client information
- **Archive client**: Soft-delete for record keeping
- **Delete client**: Permanent removal
- **Status indicator**: Visual badge for inactive clients

---

## 📝 Task Management

### Task Creation
- **Task name**: Descriptive task title
- **Category assignment**: Organize by category
- **Description**: Detailed task information
- **Estimated hours**: Time estimation
- **Billable status**: Mark as billable/non-billable

### Task Categories
- **Category creation**: Create custom categories
- **Color coding**: Visual organization
- **Icon assignment**: Category icons
- **Common Tasks category**: Special category for auto-assignment

### Task Assignment
- **Project linking**: Assign tasks to projects
- **User assignment**: Assign to team members
- **Status tracking**: Track task completion

---

## 📊 Reporting

### Time Reports
- **By user**: Individual time tracking reports
- **By project**: Project-wise time breakdown
- **By client**: Client-wise time aggregation
- **By task**: Task-level time analysis
- **Date range selection**: Custom date ranges

### Report Features
- **Visual charts**: Bar charts, pie charts, line graphs
- **Data tables**: Detailed tabular data
- **Filtering**: Filter by user, project, client, date
- **Grouping**: Group by day, week, month

### Export Options
- **CSV export**: Comma-separated values
- **Excel export**: XLSX format with formatting
- **Safe date handling**: Invalid dates handled gracefully
- **Data sanitization**: Clean data for export

### Dashboard Metrics
- **Total hours**: Organization-wide tracking
- **This week hours**: Current week summary
- **Project count**: Active projects
- **Team utilization**: Percentage of capacity used
- **Budget alerts**: Over-budget warnings

---

## ✅ Approval Workflow

### Submission Process
1. **User adds time entries**: Throughout the week
2. **Submit for approval**: "Submit Week for Approval" button
3. **Confirmation dialog**: Shows entry count
4. **Pending status**: Entries marked as submitted

### Approval States
- **Unsubmitted**: Default state, editable
- **Pending**: Submitted, awaiting approval, still editable
- **Approved**: Locked, cannot be edited or deleted

### Approval Rules
- **Week-based approval**: Entire week approved together
- **Partial approval**: Some entries approved, others pending
- **No resubmission after approval**: Once any entry in a week is approved:
  - Remaining unsubmitted entries cannot be submitted
  - Week shows "Approved" status
  - Add/edit/delete disabled for that week
- **Unsubmitted entries excluded**: After approval, any unsubmitted entries in that week are hidden from all views

### Admin/Manager Approval View
- **Pending approvals list**: View all pending submissions
- **User grouping**: Grouped by team member
- **Week breakdown**: See entries by week
- **Approve action**: One-click approval
- **Entry details**: View hours, notes, project, task

### Status Badges
- **Approved** (Green): Week has been approved
- **Pending** (Amber): Awaiting approval
- **No badge**: Unsubmitted entries

---

## 🚀 Installation

### Prerequisites
- Node.js 18+ (LTS recommended)
- npm or yarn package manager
- Sanity.io account (free tier available)
- Google Cloud Console project (for OAuth)

### Step-by-Step Installation

1. **Clone the repository**
```bash
git clone <repository-url>
cd sanity-multitime-app
```

2. **Install dependencies**
```bash
npm install
```

3. **Configure environment variables**
```bash
cp .env.example .env.local
```

4. **Set up Sanity project**
- Create a project at [sanity.io/manage](https://sanity.io/manage)
- Note your Project ID and Dataset name
- Create an API token with Editor permissions

5. **Configure Google OAuth** (optional but recommended)
- Go to [Google Cloud Console](https://console.cloud.google.com)
- Create a new project or select existing
- Enable Google+ API
- Create OAuth 2.0 credentials
- Add authorized redirect URI: `http://localhost:3000/api/auth/callback/google`

6. **Update `.env.local`** with all required values (see Environment Variables section)

7. **Create default category**
```bash
npm run create-default-category
```

8. **Create sample common tasks** (optional)
```bash
npm run create-sample-common-tasks
```

9. **Run development server**
```bash
npm run dev
```

10. **Access the application**
- App: `http://localhost:3000`
- Sanity Studio: `http://localhost:3000/studio`

---

## 🔧 Environment Variables 

Create a `.env.local` file with the following variables:

```env
# Sanity Configuration
NEXT_PUBLIC_SANITY_PROJECT_ID=your_project_id
NEXT_PUBLIC_SANITY_DATASET=production
SANITY_API_TOKEN=your_editor_token

# NextAuth Configuration
NEXTAUTH_SECRET=your_random_secret_key
NEXTAUTH_URL=http://localhost:3000

# Google OAuth (Optional)
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret

# App Configuration
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### Variable Details

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_SANITY_PROJECT_ID` | Yes | Your Sanity project ID |
| `NEXT_PUBLIC_SANITY_DATASET` | Yes | Dataset name (usually "production") |
| `SANITY_API_TOKEN` | Yes | API token with Editor permissions |
| `NEXTAUTH_SECRET` | Yes | Random secret for session encryption |
| `NEXTAUTH_URL` | Yes | Base URL of your application |
| `GOOGLE_CLIENT_ID` | No | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | No | Google OAuth client secret |

---

## 📂 Project Structure

```
sanity-multitime-app/
├── src/
│   ├── app/                          # Next.js App Router
│   │   ├── admin/                    # Admin routes
│   │   │   ├── manage/               # Client, Task management
│   │   │   ├── projects/             # Project management
│   │   │   ├── reports/              # Admin reports
│   │   │   ├── team/                 # Team management
│   │   │   │   └── details/[id]/     # Member details
│   │   │   └── time-entries/         # Timesheet management
│   │   │       └── pending/[id]/     # Approval page
│   │   ├── api/                      # API routes
│   │   │   ├── auth/                 # Authentication APIs
│   │   │   ├── team/                 # Team APIs
│   │   │   ├── time-entries/         # Time entry APIs
│   │   │   └── ...                   # Other APIs
│   │   ├── auth/                     # Auth pages
│   │   │   ├── signin/               # Login page
│   │   │   ├── signup/               # Registration page
│   │   │   ├── forgot-password/      # Password reset
│   │   │   └── error/                # Auth error page
│   │   ├── dashboard/                # User dashboard
│   │   └── studio/                   # Sanity Studio
│   ├── components/                   # React components
│   │   ├── admin/                    # Admin components
│   │   │   └── time-entries/         # Timesheet components
│   │   ├── layouts/                  # Layout components
│   │   ├── ui/                       # Shared UI components
│   │   └── user/                     # User components
│   ├── lib/                          # Utilities
│   │   ├── authOptions.ts            # NextAuth configuration
│   │   ├── queries.ts                # Sanity GROQ queries
│   │   ├── sanity.ts                 # Sanity client
│   │   └── time.ts                   # Time utilities
│   └── sanity/                       # Sanity configuration
│       └── schemas/                  # Content schemas
├── public/                           # Static assets
├── scripts/                          # Utility scripts
└── docs/                             # Documentation
```

---

## 📡 API Reference

### Authentication APIs

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/signin` | POST | Sign in with credentials |
| `/api/auth/register` | POST | Register new user |
| `/api/auth/forgot-password` | POST | Request password reset |
| `/api/auth/reset-password` | POST | Reset password with token |

### Time Entry APIs

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/time-entries` | GET | Fetch time entries |
| `/api/time-entries` | POST | Create time entry |
| `/api/time-entries/[id]` | PUT | Update time entry |
| `/api/time-entries/[id]` | DELETE | Delete time entry |
| `/api/time-entries/[id]` | PATCH | Approve/lock entry |
| `/api/time-entries/submit-week` | POST | Submit week for approval |

### Team APIs

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/team/weekly` | GET | Get weekly team stats |
| `/api/team/members/[id]` | GET | Get member details |
| `/api/team/members/[id]` | PUT | Update member |
| `/api/team/members/[id]` | DELETE | Delete member |
| `/api/team/pending-approvals` | POST | Check pending approvals |

---

## 🚢 Deployment

### Vercel Deployment (Recommended)

1. **Connect repository** to Vercel
2. **Configure environment variables** in Vercel dashboard
3. **Deploy** - Vercel auto-detects Next.js

### Environment Variables on Vercel
- Add all variables from `.env.local` to Vercel's Environment Variables
- Update `NEXTAUTH_URL` to your production URL
- Update Google OAuth redirect URIs for production domain

### Post-Deployment
1. Run `npm run create-default-category` (if not already done)
2. Create initial admin user via Sanity Studio
3. Test authentication flows

---

## 🎨 UI/UX Features

- **Responsive design**: Mobile-first approach
- **Theme support**: Customizable color themes
- **Skeleton loaders**: Smooth loading states
- **Toast notifications**: User feedback
- **Keyboard shortcuts**: Efficient navigation
- **Optimistic updates**: Instant UI feedback
- **Error handling**: Graceful error messages

---

## 🔒 Security Features

- **Role-based access control (RBAC)**: Granular permissions
- **API route protection**: Server-side authentication checks
- **Input validation**: Client and server-side validation
- **Password hashing**: bcryptjs encryption
- **Session security**: JWT with secure secrets
- **CORS protection**: API security headers
- **Token-based password reset**: Secure reset flow

---

## 📝 License

MIT License - see [LICENSE](LICENSE) file for details.

---

## 🤝 Contributing

Contributions are welcome! Please read our contributing guidelines before submitting PRs.

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📞 Support

For questions and support:
- Open an issue on GitHub
- Contact: support@example.com

---

## 📄 Changelog

### Latest Updates
- Added Google OAuth authentication
- Implemented week-based approval workflow
- Added inline cell editing for week view
- Optimized API calls for better performance
- Added submit button to day view
- Fixed date calculation for cross-month weeks
- Enhanced password validation
- Added inactive client indicator
- Improved team module loading performance

---

*Built with ❤️ using Next.js and Sanity*
