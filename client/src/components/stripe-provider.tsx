import { Elements } from '@stripe/react-stripe-js';
import { stripePromise } from '@/lib/stripe';

interface StripeProviderProps {
  children: React.ReactNode;
}

export function StripeProvider({ children }: StripeProviderProps) {
  return (
    <Elements stripe={stripePromise} options={{
      appearance: {
        theme: 'stripe',
        variables: {
          colorPrimary: 'hsl(221.2, 83.2%, 53.3%)',
          colorBackground: 'hsl(0, 0%, 100%)',
          colorText: 'hsl(222.2, 84%, 4.9%)',
          colorDanger: 'hsl(0, 84.2%, 60.2%)',
          borderRadius: '6px',
        },
      },
    }}>
      {children}
    </Elements>
  );
}