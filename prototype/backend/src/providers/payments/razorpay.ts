import { env } from '../../config/env.js'
import { hmacHex, safeEqualHex, type PaymentProvider } from './index.js'

const API = 'https://api.razorpay.com/v1'

/**
 * Razorpay over plain fetch: four endpoints do not justify the SDK.
 *
 * Orders are created with manual capture, so checkout only authorizes the
 * amount. We capture the final fare when the trip completes. An authorization
 * that is never captured is voided by Razorpay automatically, which is how a
 * cancelled trip's hold is released; there is no "void" call to make.
 */
export class RazorpayPaymentProvider implements PaymentProvider {
  readonly name = 'razorpay' as const
  readonly publicKey: string
  private readonly auth: string

  constructor() {
    if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET || !env.RAZORPAY_WEBHOOK_SECRET) {
      throw new Error(
        'PAYMENTS_PROVIDER=razorpay requires RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET and RAZORPAY_WEBHOOK_SECRET',
      )
    }
    this.publicKey = env.RAZORPAY_KEY_ID
    this.auth = 'Basic ' + Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString('base64')
  }

  private async call(path: string, body: unknown): Promise<Record<string, any>> {
    const res = await fetch(`${API}${path}`, {
      method: 'POST',
      headers: { authorization: this.auth, 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    })
    const json = (await res.json().catch(() => ({}))) as Record<string, any>
    if (!res.ok) {
      throw new Error(`Razorpay ${path} failed: ${res.status} ${json.error?.description ?? ''}`.trim())
    }
    return json
  }

  async createOrder(amountPaise: number, receipt: string): Promise<{ orderId: string }> {
    const order = await this.call('/orders', {
      amount: amountPaise,
      currency: 'INR',
      receipt,
      payment: {
        capture: 'manual',
        // Trips can run long; hold the authorization for up to 3 days.
        capture_options: { manual_expiry_period: 4320, refund_speed: 'optimum' },
      },
    })
    return { orderId: order.id as string }
  }

  verifyCheckoutSignature(orderId: string, paymentId: string, signature: string): boolean {
    return safeEqualHex(hmacHex(env.RAZORPAY_KEY_SECRET!, `${orderId}|${paymentId}`), signature)
  }

  verifyWebhookSignature(rawBody: string, signature: string): boolean {
    return safeEqualHex(hmacHex(env.RAZORPAY_WEBHOOK_SECRET!, rawBody), signature)
  }

  async capture(paymentId: string, amountPaise: number): Promise<void> {
    await this.call(`/payments/${paymentId}/capture`, { amount: amountPaise, currency: 'INR' })
  }

  async refund(paymentId: string, amountPaise: number): Promise<{ refundId: string }> {
    const r = await this.call(`/payments/${paymentId}/refund`, { amount: amountPaise })
    return { refundId: r.id as string }
  }
}
