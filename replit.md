# Overview

This is a production-ready multi-tenant SaaS application for independent pharmacies, built with modern web technologies. The system provides comprehensive pharmacy management capabilities including inventory tracking with FIFO/WAC pricing, customer management, point-of-sale operations, delivery coordination, loyalty programs, and credit management. The application is designed with a modular architecture where features can be enabled/disabled per tenant through feature flags, ensuring flexibility for different pharmacy needs.

# User Preferences

Preferred communication style: Simple, everyday language.

# Recent Changes

## 2025-09-11: Critical Navigation Architecture Fix
- **RESOLVED MAJOR BUG**: Fixed persistent navigation issue where URL changed but content remained stuck on Dashboard
- **Root Cause**: Multiple `useTenant` hook instances created separate state instances across 15+ components  
- **Solution**: Migrated from individual `useState` hooks to React Context (`TenantProvider`) for global state sharing
- **Impact**: All navigation now works correctly - tenant selection properly triggers dashboard navigation
- **Architecture**: Centralized tenant state management ensures all components share same state instance
- **Testing**: Comprehensive end-to-end testing confirms complete routing functionality

# System Architecture

## Technology Stack
- **Frontend**: React with TypeScript, using Vite for bundling and development
- **Backend**: Express.js server with TypeScript
- **Database**: PostgreSQL with Drizzle ORM for type-safe database operations
- **UI Framework**: shadcn/ui components with Tailwind CSS for responsive design
- **Authentication**: OpenID Connect integration with Replit Auth
- **Payment Processing**: Stripe integration for card payments
- **Routing**: Wouter for client-side routing
- **State Management**: TanStack Query for server state management
- **Tenant Context**: React Context for global tenant state management

## Database Design
The system uses a multi-tenant PostgreSQL database with strict tenant isolation through Row Level Security (RLS). Key architectural decisions:

- **Tenant Isolation**: All business data tables include a `tenant_id` column with RLS policies
- **User Management**: Users can belong to multiple tenants with different roles (super_admin, owner, manager, staff)
- **Feature Flags**: Global feature flags with tenant-specific overrides for modular functionality
- **Session Storage**: PostgreSQL-based session storage for authentication persistence

## Authentication & Authorization
- **Multi-tenant Auth**: Users authenticate once but can access multiple tenants based on their memberships
- **Role-based Access**: Four-tier role system with hierarchical permissions
- **Session Management**: Server-side sessions with PostgreSQL storage
- **Tenant Context**: All API operations are tenant-scoped through session-derived context

## Frontend Architecture
- **Component Structure**: Organized into pages, layouts, and reusable UI components
- **Responsive Design**: Mobile-first approach with Tailwind CSS
- **Type Safety**: End-to-end TypeScript with shared schema definitions
- **Feature Flag Integration**: UI components conditionally render based on tenant feature flags
- **Error Handling**: Centralized error handling with toast notifications

## API Design
- **RESTful Structure**: Tenant-scoped endpoints following `/api/tenants/:id/resource` pattern
- **Type Safety**: Shared TypeScript schemas between client and server
- **Middleware Stack**: Authentication, tenant isolation, and error handling middleware
- **Query Optimization**: Efficient database queries with Drizzle ORM relationships

## Feature Flag System
Enables modular functionality per tenant:
- Dashboard analytics and KPIs
- Inventory management with batch tracking
- Customer relationship management
- Point-of-sale operations
- Delivery coordination
- Loyalty programs
- Credit management
- Payment processing

# External Dependencies

## Core Infrastructure
- **Database**: PostgreSQL (configured for Neon serverless)
- **Authentication**: Replit OpenID Connect provider
- **Session Storage**: PostgreSQL with connect-pg-simple

## Payment Processing
- **Stripe**: Card payment processing with webhooks
- **Payment Methods**: Support for card, cash, and custom payment types

## Development Tools
- **Vite**: Frontend build tool with HMR
- **Drizzle**: Database ORM with migration support
- **TypeScript**: End-to-end type safety

## UI Components
- **Radix UI**: Accessible component primitives
- **Tailwind CSS**: Utility-first styling
- **Lucide React**: Icon system

The system is designed to be platform-agnostic and can be deployed on various hosting providers with minimal configuration changes. Database migrations are handled through Drizzle Kit, and the application supports both development and production environments through environment-specific configuration.