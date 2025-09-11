import { loadStripe } from '@stripe/stripe-js';

// Initialize Stripe with public key
const stripePublicKey = import.meta.env.VITE_STRIPE_PUBLIC_KEY;

export const stripePromise = stripePublicKey 
  ? loadStripe(stripePublicKey)
  : null;

export const STRIPE_ENABLED = !!stripePublicKey;

if (!stripePublicKey) {
  console.warn('Stripe public key not configured - payment processing will be limited to manual methods');
} else {
  console.log('Stripe frontend initialized successfully');
}