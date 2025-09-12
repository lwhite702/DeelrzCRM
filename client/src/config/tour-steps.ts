import { DriveStep } from "driver.js";

export interface TourStep extends Omit<DriveStep, 'element'> {
  id: string;
  element: string; // CSS selector (usually data-testid)
  title: string;
  description: string;
  position?: 'top' | 'bottom' | 'left' | 'right' | 'auto';
  category: 'welcome' | 'dashboard' | 'inventory' | 'customers' | 'sales' | 'payments' | 'help' | 'complete';
  requiredPath?: string; // Route path where this step should be shown
  featureFlag?: string; // Optional feature flag requirement
  conditional?: () => boolean; // Optional condition to show this step
  onNext?: () => void; // Optional callback when moving to next step
  onPrev?: () => void; // Optional callback when moving to previous step
}

export const tourSteps: TourStep[] = [
  // Welcome
  {
    id: 'welcome',
    element: '[data-testid="main-layout"]',
    title: 'Welcome to DeelRxCRM! 🎉',
    description: 'Let\'s take a quick tour to help you get started with your pharmacy management system. This will only take a few minutes.',
    position: 'bottom',
    category: 'welcome',
    popover: {
      showButtons: ['next'],
      nextBtnText: 'Start Tour',
    }
  },

  // Dashboard Overview
  {
    id: 'dashboard-overview',
    element: '[data-testid="page-dashboard"]',
    title: 'Dashboard Overview',
    description: 'This is your main dashboard where you can see important metrics and quick insights about your pharmacy operations.',
    position: 'bottom',
    category: 'dashboard',
    requiredPath: '/dashboard'
  },

  // KPI Cards
  {
    id: 'dashboard-kpis',
    element: '[data-testid="kpi-cards"]',
    title: 'Key Performance Indicators',
    description: 'These cards show your most important metrics: today\'s revenue, orders, low stock alerts, and overdue credits.',
    position: 'bottom',
    category: 'dashboard',
    requiredPath: '/dashboard'
  },

  // Navigation
  {
    id: 'navigation-sidebar',
    element: '[data-testid="sidebar-navigation"]',
    title: 'Navigation Menu',
    description: 'Use this sidebar to navigate between different modules: Inventory, Customers, Sales, Payments, and more.',
    position: 'right',
    category: 'dashboard'
  },

  // Inventory Module
  {
    id: 'inventory-navigation',
    element: '[data-testid="nav-inventory"]',
    title: 'Inventory Management',
    description: 'Click here to manage your pharmacy inventory, track products, and monitor stock levels.',
    position: 'right',
    category: 'inventory',
    onNext: () => {
      // Navigate to inventory page
      if (window.location.pathname !== '/inventory') {
        window.history.pushState({}, '', '/inventory');
        window.dispatchEvent(new PopStateEvent('popstate'));
      }
    }
  },

  {
    id: 'inventory-add-product',
    element: '[data-testid="button-add-product"]',
    title: 'Add New Products',
    description: 'Use this button to add new products to your inventory. You can specify product details, NDC codes, and units.',
    position: 'bottom',
    category: 'inventory',
    requiredPath: '/inventory'
  },

  {
    id: 'inventory-products-list',
    element: '[data-testid="products-table"]',
    title: 'Product Management',
    description: 'View all your products here. You can see current stock levels, WAC (Wholesale Acquisition Cost), and stock status.',
    position: 'top',
    category: 'inventory',
    requiredPath: '/inventory'
  },

  // Customers Module
  {
    id: 'customers-navigation',
    element: '[data-testid="nav-customers"]',
    title: 'Customer Management',
    description: 'Manage your customer database, loyalty programs, and customer preferences here.',
    position: 'right',
    category: 'customers',
    onNext: () => {
      if (window.location.pathname !== '/customers') {
        window.history.pushState({}, '', '/customers');
        window.dispatchEvent(new PopStateEvent('popstate'));
      }
    }
  },

  {
    id: 'customers-add-customer',
    element: '[data-testid="button-add-customer"]',
    title: 'Add New Customers',
    description: 'Click here to add new customers with their contact information, preferences, and notes.',
    position: 'bottom',
    category: 'customers',
    requiredPath: '/customers'
  },

  {
    id: 'customers-list',
    element: '[data-testid="customers-table"]',
    title: 'Customer Database',
    description: 'View all your customers with their loyalty status, credit information, and contact details.',
    position: 'top',
    category: 'customers',
    requiredPath: '/customers'
  },

  // Sales Module
  {
    id: 'sales-navigation',
    element: '[data-testid="nav-sales"]',
    title: 'Sales & POS',
    description: 'Process sales transactions, create orders, and manage the point-of-sale system.',
    position: 'right',
    category: 'sales',
    onNext: () => {
      if (window.location.pathname !== '/sales') {
        window.history.pushState({}, '', '/sales');
        window.dispatchEvent(new PopStateEvent('popstate'));
      }
    }
  },

  {
    id: 'sales-create-order',
    element: '[data-testid="button-new-order"]',
    title: 'Create New Order',
    description: 'Start a new sale by clicking here. You can add products, calculate totals, and process payments.',
    position: 'bottom',
    category: 'sales',
    requiredPath: '/sales'
  },

  {
    id: 'sales-calculator-tools',
    element: '[data-testid="calculator-tools"]',
    title: 'Sales Calculator Tools',
    description: 'Use these helpful calculators to convert quantities to prices or amounts to quantities based on your margins.',
    position: 'top',
    category: 'sales',
    requiredPath: '/sales'
  },

  // Payments Module
  {
    id: 'payments-navigation',
    element: '[data-testid="nav-payments"]',
    title: 'Payment Processing',
    description: 'Manage payment methods, view transaction history, and handle payment processing.',
    position: 'right',
    category: 'payments',
    onNext: () => {
      if (window.location.pathname !== '/payments') {
        window.history.pushState({}, '', '/payments');
        window.dispatchEvent(new PopStateEvent('popstate'));
      }
    }
  },

  {
    id: 'payments-methods',
    element: '[data-testid="payment-methods"]',
    title: 'Payment Methods',
    description: 'Configure and manage different payment methods: cards, cash, transfers, and custom payment types.',
    position: 'bottom',
    category: 'payments',
    requiredPath: '/payments'
  },

  {
    id: 'payments-history',
    element: '[data-testid="payments-table"]',
    title: 'Payment History',
    description: 'View all payment transactions, their status, and processing details.',
    position: 'top',
    category: 'payments',
    requiredPath: '/payments'
  },

  // Help System
  {
    id: 'help-navigation',
    element: '[data-testid="nav-help"]',
    title: 'Help & Support',
    description: 'Access the help system, knowledge base, and support resources whenever you need assistance.',
    position: 'right',
    category: 'help',
    onNext: () => {
      if (window.location.pathname !== '/help') {
        window.history.pushState({}, '', '/help');
        window.dispatchEvent(new PopStateEvent('popstate'));
      }
    }
  },

  {
    id: 'help-search',
    element: '[data-testid="tab-search"]',
    title: 'Search Help Articles',
    description: 'Search our comprehensive knowledge base for answers to your questions.',
    position: 'bottom',
    category: 'help',
    requiredPath: '/help'
  },

  {
    id: 'help-browse',
    element: '[data-testid="tab-browse"]',
    title: 'Browse Help Categories',
    description: 'Browse help articles by category: Getting Started, Features, Troubleshooting, and more.',
    position: 'bottom',
    category: 'help',
    requiredPath: '/help'
  },

  // Tour Complete
  {
    id: 'tour-complete',
    element: '[data-testid="main-layout"]',
    title: 'Tour Complete! ✅',
    description: 'Congratulations! You\'ve completed the tour. You can replay this tour anytime from the Help menu. Happy managing!',
    position: 'bottom',
    category: 'complete',
    popover: {
      showButtons: ['close'],
    }
  }
];

// Helper functions for tour management
export const getTourStepsByCategory = (category: string): TourStep[] => {
  return tourSteps.filter(step => step.category === category);
};

export const getTourStepsForPath = (path: string): TourStep[] => {
  return tourSteps.filter(step => !step.requiredPath || step.requiredPath === path);
};

export const getTourStepById = (id: string): TourStep | undefined => {
  return tourSteps.find(step => step.id === id);
};

export const getNextStepId = (currentStepId: string): string | null => {
  const currentIndex = tourSteps.findIndex(step => step.id === currentStepId);
  if (currentIndex === -1 || currentIndex === tourSteps.length - 1) {
    return null;
  }
  return tourSteps[currentIndex + 1].id;
};

export const getPreviousStepId = (currentStepId: string): string | null => {
  const currentIndex = tourSteps.findIndex(step => step.id === currentStepId);
  if (currentIndex <= 0) {
    return null;
  }
  return tourSteps[currentIndex - 1].id;
};

// Tour configuration constants
export const TOUR_CONFIG = {
  allowClose: true,
  animate: true,
  smoothScroll: true,
  padding: 10,
  stagePadding: 10,
  stageRadius: 5,
  showProgress: true,
  progressText: "Step {{current}} of {{total}}",
  nextBtnText: "Next",
  prevBtnText: "Previous",
  doneBtnText: "Complete Tour",
  closeBtnText: "Skip Tour",
  showButtons: ['next', 'previous', 'close'],
  disableActiveInteraction: false,
  allowKeyboardControl: true,
  keyboardControl: {
    escape: false, // Don't close on escape, let user use close button
    arrowLeft: true,
    arrowRight: true,
  },
  onDestroyed: () => {
    console.log('Tour ended');
  },
} as const;

export default tourSteps;