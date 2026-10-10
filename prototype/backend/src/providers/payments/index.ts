import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { env } from '../../config/env.js'
import { RazorpayPaymentProvider } from './razorpay.js'

/** All amounts cross this boundary in paise: integers, so no float drift. */
export interface PaymentProvider {
  readonly name: 'mock' | 'razorpay'
  /** Public key the checkout page needs; never the secret. */
  readonly publicKey: string
  /** An order whose payment is authorized but NOT captured until we say so. */
  createOrder(amountPaise: number, receipt: string): Promise<{ orderId: string }>
  verifyCheckoutSignature(orderId: string, paymentId: string, signature: string): boolean
  verifyWebhookSignature(rawBody: string, signature: string): boolean
  capture(paymentId: string, amountPaise: number): Promise<void>
  refund(paymentId: string, amountPaise: number): Promise<{ refundId: string }>
}

export const hmacHex = (secret: string, data: string): string =>
  createHmac('sha256', secret).update(data).digest('hex')

/** Constant-time compare. A plain === leaks how many leading characters match. */
export function safeEqualHex(a: string, b: string): boolean {
  const x = Buffer.from(a, 'utf8')
  const y = Buffer.from(b, 'utf8')
  return x.length === y.length && timingSafeEqual(x, y)
}

export const MOCK_SECRET = 'mock-payments-secret'

/**
 * Signs exactly the way Razorpay does, with a fixed secret, so the verify and
 * webhook code paths are the same ones production runs.
 */
export class MockPaymentProvider implements PaymentProvider {
  readonly name = 'mock' as const
  readonly publicKey = 'rzp_test_mock'
  readonly captured: Array<{ paymentId: string; amountPaise: number }> = []
  readonly refunds: Array<{ paymentId: string; amountPaise: number }> = []

  async createOrder(): Promise<{ orderId: string }> {
    return { orderId: `order_mock_${randomBytes(8).toString('hex')}` }
  }

  /** What the mock checkout page does when "Approve" is pressed. */
  approve(orderId: string): { paymentId: string; signature: string } {
    const paymentId = `pay_mock_${randomBytes(8).toString('hex')}`
    return { paymentId, signature: hmacHex(MOCK_SECRET, `${orderId}|${paymentId}`) }
  }

  verifyCheckoutSignature(orderId: string, paymentId: string, signature: string): boolean {
    return safeEqualHex(hmacHex(MOCK_SECRET, `${orderId}|${paymentId}`), signature)
  }

  verifyWebhookSignature(rawBody: string, signature: string): boolean {
    return safeEqualHex(hmacHex(MOCK_SECRET, rawBody), signature)
  }

  async capture(paymentId: string, amountPaise: number): Promise<void> {
    this.captured.push({ paymentId, amountPaise })
  }

  async refund(paymentId: string, amountPaise: number): Promise<{ refundId: string }> {
    this.refunds.push({ paymentId, amountPaise })
    return { refundId: `rfnd_mock_${randomBytes(6).toString('hex')}` }
  }
}

let instance: PaymentProvider | null | undefined

/**
 * null means payments are switched off: booking dispatches immediately. Tests
 * run with payments off unless a test installs a provider, so the large trip
 * suite does not need a checkout step per trip.
 */
export function getPaymentProvider(): PaymentProvider | null {
  if (instance === undefined) {
    if (env.NODE_ENV === 'test' || env.PAYMENTS_PROVIDER === 'none') instance = null
    else instance = env.PAYMENTS_PROVIDER === 'razorpay' ? new RazorpayPaymentProvider() : new MockPaymentProvider()
  }
  return instance
}

/** Test-only: force a provider, or pass null to switch payments off. */
export function setPaymentProvider(provider: PaymentProvider | null | undefined): void {
  instance = provider
}
