// Razorpay Standard Checkout — loaded on demand (only when a user actually
// opens the pricing page's upgrade flow) rather than on every page load.

export interface RazorpayCheckoutOptions {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  prefill?: { name?: string; email?: string };
  theme?: { color?: string };
  handler: (response: {
    razorpay_payment_id: string;
    razorpay_order_id: string;
    razorpay_signature: string;
  }) => void;
  modal?: { ondismiss?: () => void };
}

interface RazorpayCheckoutInstance {
  open: () => void;
  on: (event: 'payment.failed', handler: (response: { error: { description: string } }) => void) => void;
}

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayCheckoutOptions) => RazorpayCheckoutInstance;
  }
}

const CHECKOUT_SCRIPT_SRC = 'https://checkout.razorpay.com/v1/checkout.js';

let loadPromise: Promise<void> | null = null;

function loadCheckoutScript(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  if (loadPromise) return loadPromise;
  loadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = CHECKOUT_SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Razorpay checkout script'));
    document.body.appendChild(script);
  });
  return loadPromise;
}

/**
 * Opens the Razorpay Standard Checkout modal. Resolves with the payment
 * response on success, rejects on modal dismiss / payment.failed.
 */
export async function openRazorpayCheckout(
  options: Omit<RazorpayCheckoutOptions, 'handler' | 'modal'>,
): Promise<{ razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }> {
  await loadCheckoutScript();
  if (!window.Razorpay) throw new Error('Razorpay checkout script did not load');

  return new Promise((resolve, reject) => {
    const rzp = new window.Razorpay!({
      ...options,
      handler: (response) => resolve(response),
      modal: {
        ondismiss: () => reject(new Error('dismissed')),
      },
    });
    rzp.on('payment.failed', (response) => {
      reject(new Error(response.error?.description || 'Payment failed'));
    });
    rzp.open();
  });
}
