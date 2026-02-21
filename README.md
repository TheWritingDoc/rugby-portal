# EPHSRU Rugby Registration Portal

A comprehensive mobile-first Progressive Web Application for Eastern Cape Schools Rugby registration with role-based access control, audit trails, and secure data management.

## Features

- **Mobile-First Design**: Optimized for mobile devices with 2025 UI standards
- **Role-Based Access Control (RBAC)**: 
  - Player, Referee, Coach, SchoolAdmin, ZoneCoordinator, EPHSRUAdmin roles
  - Zone and school-based data scoping
  - Granular permissions for create, read, update operations
- **Comprehensive Registration Forms**:
  - School registration with principal/coordinator details
  - Player registration with age group suggestions
  - Coach registration with qualifications
  - Referee registration
  - Admin user management
- **Advanced Functionality**:
  - Cascading dropdowns (Zone → School → Pool/Quintile)
  - Age group suggestions based on DOB and gender
  - Form validations (email, phone, ID)
  - Progressive saving with localStorage drafts
  - File upload and approval workflow
  - Audit trail for all operations
- **Security & Compliance**:
  - JWT authentication with role-based access
  - Server-side data filtering and scoping
  - Audit logging for all create/update actions
  - Secure file upload handling
- **Data Management**:
  - SQLite database with proper schema
  - CSV export functionality for reports
  - Real-time dashboard with role-based views
- **Testing & Quality**:
  - Comprehensive E2E test suite with Playwright
  - 12 test scenarios covering all user flows
  - CI/CD pipeline with automated testing

## Technology Stack

- **Frontend**: React 18 + Vite + TypeScript + Tailwind CSS
- **Backend**: Express.js + SQLite + JWT Authentication
- **Testing**: Playwright for E2E testing
- **Deployment**: Vercel with GitHub Actions CI/CD

## Quick Start

### Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Start backend server
npm run server

# Run E2E tests
npm run test:e2e
```

### Production Deployment

```bash
# Build and test
npm run build
npm run test:e2e

# Deploy to Vercel
npm run deploy
```

## Database Schema

The application uses SQLite with the following main tables:

- **schools**: School registration data with zone/school scoping
- **players**: Player registration with personal and contact details
- **coaches**: Coach registration with qualifications and experience
- **referees**: Referee registration details
- **admins**: Admin user management
- **audits**: Complete audit trail of all operations
- **documents**: File upload and approval workflow

## API Endpoints

All endpoints support role-based access control:

- `POST /api/login` - Authentication
- `GET/POST/PUT /api/schools` - School management
- `GET/POST/PUT /api/players` - Player management
- `GET/POST/PUT /api/coaches` - Coach management
- `GET/POST/PUT /api/referees` - Referee management
- `GET/POST/PUT /api/admins` - Admin management
- `GET /api/audits` - Audit logs (EPHSRUAdmin only)
- `GET/POST /api/documents` - Document management
- `POST /api/upload` - File upload

## Role Permissions

| Role | School | Player | Coach | Referee | Admin | Approvals | Reports |
|------|--------|---------|--------|----------|--------|-----------|---------|
| Player | ❌ | ✅ Own | ❌ | ❌ | ❌ | ❌ | ❌ |
| Referee | ❌ | ❌ | ❌ | ✅ Own | ❌ | ❌ | ❌ |
| Coach | ❌ | ✅ School | ✅ School | ❌ | ❌ | ❌ | ❌ |
| SchoolAdmin | ✅ School | ✅ School | ✅ School | ❌ | ❌ | ✅ School | ❌ |
| ZoneCoordinator | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ Zone |
| EPHSRUAdmin | ✅ All | ✅ All | ✅ All | ✅ All | ✅ All | ✅ All | ✅ All |

## Security Features

- JWT-based authentication with role claims
- Server-side data filtering by zone and school
- Input validation and sanitization
- Secure file upload with validation
- Audit logging for all data modifications
- HTTPS enforcement in production
- Security headers (CSP, XSS protection, etc.)

## Testing

The application includes comprehensive E2E tests covering:

- User authentication and role switching
- Form submissions and validations
- Role-based navigation gating
- Data scoping and permissions
- File upload and approval workflow
- Dashboard functionality
- Audit log access

Run tests with: `npm run test:e2e`

## Deployment

### Vercel Deployment

1. Connect your GitHub repository to Vercel
2. Configure environment variables:
   - `JWT_SECRET`: Your JWT signing secret
   - `NODE_ENV`: Set to `production`
3. The CI/CD pipeline will automatically:
   - Run tests on every push
   - Deploy to production only if tests pass
   - Generate test reports

### Environment Variables

- `JWT_SECRET`: Secret key for JWT signing (required)
- `NODE_ENV`: Environment (development/production)
- `PORT`: Server port (default: 4000)
- `SSL_CERT`: SSL certificate path (production)
- `SSL_KEY`: SSL private key path (production)

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests: `npm run test:e2e`
5. Submit a pull request

## License

This project is licensed under the MIT License.