import { createHash } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { corsOrigins, env } from '../../config/env.js'
import { badRequest, conflict, unauthorized } from '../../lib/errors.js'
import { getPaymentProvider, MockPaymentProvider } from '../../providers/payments/index.js'
import { requireAuth, requireRole } from '../auth/rbac.js'
import {
  getPayment,
  getPaymentForTrip,
  handleWebhookEvent,
  listPayments,
  markFailed,
  refundPayment,
  verifyCheckout,
} from './service.js'

export const PaymentSchema = z.object({
  id: z.string().uuid(),
  trip_id: z.string().uuid(),
  provider: z.string(),
  provider_order_id: z.string(),
  provider_payment_id: z.string().nullable(),
  status: z.enum(['CREATED', 'AUTHORIZED', 'CAPTURED', 'RELEASED', 'REFUNDED', 'FAILED']),
  amount_authorized: z.number(),
  amount_captured: z.number(),
  amount_refunded: z.number(),
  amount_due: z.number(),
  failure_reason: z.string().nullable(),
  checkout_url: z.string(),
  created_at: z.coerce.string(),
})

const FIN = ['FINANCE', 'SUPER_ADMIN'] as const
const FIN_READ = ['FINANCE', 'OPS_MANAGER', 'SUPER_ADMIN'] as const

/**
 * Only send the browser back to our own web origins. Anything else would turn
 * the checkout page into an open redirect usable for phishing.
 */
function safeReturn(url: string | undefined): string | null {
  if (!url) return null
  const allowed = [env.PUBLIC_WEB_URL, ...corsOrigins()]
  try {
    const origin = new URL(url).origin
    return allowed.some((a) => new URL(a).origin === origin) ? url : null
  } catch {
    return null
  }
}

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

function checkoutPage(p: { id: string; order: string; amount: number; status: string; key: string; mock: boolean; ret: string | null }): string {
  const amount = `₹${p.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
  const done = p.status !== 'CREATED' && p.status !== 'FAILED'
  const data = JSON.stringify({ id: p.id, order: p.order, paise: Math.round(p.amount * 100), key: p.key, ret: p.ret })
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>MyDriver · Secure payment</title>
<style>
:root{color-scheme:dark;--bg:#0a0a0a;--card:#171717;--line:#262626;--fg:#fafafa;--mut:#a3a3a3;--acc:#f59e0b}
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--bg);color:var(--fg);font:16px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;padding:16px}
.card{width:100%;max-width:400px;background:var(--card);border:1px solid var(--line);border-radius:20px;padding:28px}
.brand{font-weight:700;letter-spacing:.02em;color:var(--acc);font-size:14px}h1{font-size:22px;margin:8px 0 4px}
.amt{font-size:36px;font-weight:700;margin:20px 0 4px}.mut{color:var(--mut);font-size:14px}
button{width:100%;padding:14px;border-radius:12px;border:0;font:inherit;font-weight:600;cursor:pointer;margin-top:12px}
.pri{background:var(--acc);color:#111}.sec{background:transparent;color:var(--fg);border:1px solid var(--line)}
.msg{margin-top:16px;padding:12px;border-radius:12px;background:#0f2a1a;color:#86efac;font-size:14px;display:none}
.err{background:#2a0f0f;color:#fca5a5}.tag{display:inline-block;font-size:12px;padding:2px 8px;border-radius:999px;border:1px solid var(--line);color:var(--mut);margin-top:16px}
</style></head><body><main class="card">
<div class="brand">MYDRIVER</div><h1>Confirm your trip</h1>
<p class="mut">We place a hold for the quoted fare now. You are charged the final fare when the trip ends, and the hold is released if it is cancelled.</p>
<div class="amt">${amount}</div><div class="mut">Hold amount</div>
<div id="actions" ${done ? 'hidden' : ''}>
${p.mock
  ? '<button class="pri" id="ok">Approve test payment</button><button class="sec" id="no">Decline</button><span class="tag">Test mode · no money moves</span>'
  : '<button class="pri" id="pay">Pay securely</button><span class="tag">Secured by Razorpay</span>'}
</div>
<div id="msg" class="msg" ${done ? 'style="display:block"' : ''}>${done ? 'Payment confirmed. You can return to MyDriver.' : ''}</div>
</main>
${p.mock ? '' : '<script src="https://checkout.razorpay.com/v1/checkout.js"></script>'}
<script>
const D=${data.replace(/</g, '\\u003c')};
const msg=(t,e)=>{const m=document.getElementById('msg');m.textContent=t;m.className='msg'+(e?' err':'');m.style.display='block'};
const finish=()=>{document.getElementById('actions').hidden=true;msg('Payment confirmed. You can return to MyDriver.');if(D.ret)setTimeout(()=>location.href=D.ret,1200)};
const post=(u,b)=>fetch(u,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b||{})}).then(r=>r.ok?r.json():r.json().then(j=>Promise.reject(j.error||{})));
const ok=document.getElementById('ok'),no=document.getElementById('no'),pay=document.getElementById('pay');
if(ok)ok.onclick=()=>post('/v1/payments/'+D.id+'/mock/approve').then(finish).catch(e=>msg(e.message||'Payment failed',1));
if(no)no.onclick=()=>post('/v1/payments/'+D.id+'/mock/decline').then(()=>msg('Payment declined. You can try again.',1));
if(pay)pay.onclick=()=>new Razorpay({key:D.key,order_id:D.order,amount:D.paise,currency:'INR',name:'MyDriver',description:'Trip fare hold',theme:{color:'#f59e0b'},
 handler:r=>post('/v1/payments/verify',{order_id:r.razorpay_order_id,payment_id:r.razorpay_payment_id,signature:r.razorpay_signature}).then(finish).catch(e=>msg(e.message||'Verification failed',1)),
 modal:{ondismiss:()=>msg('Payment not completed. You can try again.',1)}}).open();
</script></body></html>`
}

export function registerPaymentRoutes(app: FastifyInstance): void {
  const r = app.withTypeProvider<ZodTypeProvider>()

  /**
   * Public, like the guardian tracking page: the payment id is an unguessable
   * UUID, and nothing here can move money without a provider signature.
   */
  r.get(
    '/v1/payments/:id/checkout',
    { schema: { params: z.object({ id: z.string().uuid() }), querystring: z.object({ return: z.string().optional() }) } },
    async (request, reply) => {
      const provider = getPaymentProvider()
      if (!provider) throw conflict('PAYMENTS_DISABLED', 'Payments are not enabled on this server')
      const p = await getPayment(request.params.id)
      const html = checkoutPage({
        id: p.id,
        order: esc(p.provider_order_id),
        amount: p.amount_authorized,
        status: p.status,
        key: esc(provider.publicKey),
        mock: provider.name === 'mock',
        ret: safeReturn(request.query.return),
      })
      return reply
        .type('text/html; charset=utf-8')
        .header('cache-control', 'no-store')
        .header('referrer-policy', 'no-referrer')
        .send(html)
    },
  )

  /** Authenticated by the provider's signature, not a JWT: the browser that paid may be logged out. */
  r.post(
    '/v1/payments/verify',
    {
      schema: {
        body: z.object({ order_id: z.string().min(1), payment_id: z.string().min(1), signature: z.string().min(1) }).strict(),
      },
    },
    async (request) => verifyCheckout(request.body.order_id, request.body.payment_id, request.body.signature),
  )

  // Mock checkout buttons. Refused outright unless the mock provider is active.
  const mockOnly = () => {
    const p = getPaymentProvider()
    if (!(p instanceof MockPaymentProvider)) throw badRequest('NOT_MOCK', 'Test checkout is disabled')
    return p
  }
  r.post('/v1/payments/:id/mock/approve', { schema: { params: z.object({ id: z.string().uuid() }) } }, async (request) => {
    const mock = mockOnly()
    const p = await getPayment(request.params.id)
    const { paymentId, signature } = mock.approve(p.provider_order_id)
    return verifyCheckout(p.provider_order_id, paymentId, signature)
  })
  r.post('/v1/payments/:id/mock/decline', { schema: { params: z.object({ id: z.string().uuid() }) } }, async (request) => {
    mockOnly()
    const p = await getPayment(request.params.id)
    await markFailed(p.provider_order_id, 'Declined in test checkout')
    return { status: 'FAILED' }
  })

  r.get(
    '/v1/trips/:id/payment',
    { onRequest: [requireAuth], schema: { params: z.object({ id: z.string().uuid() }) } },
    async (request) => ({ payment: await getPaymentForTrip(request.params.id, request.auth!.userId) }),
  )

  /* ── Webhook: the signature covers the exact bytes, so parse raw ─────── */

  void app.register(async (scope) => {
    scope.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => done(null, body))
    scope.post('/v1/payments/webhook', async (request, reply) => {
      const provider = getPaymentProvider()
      if (!provider) throw conflict('PAYMENTS_DISABLED', 'Payments are not enabled on this server')
      const raw = String(request.body ?? '')
      const signature = String(request.headers['x-razorpay-signature'] ?? '')
      if (!signature || !provider.verifyWebhookSignature(raw, signature)) {
        throw unauthorized('BAD_SIGNATURE', 'Webhook signature did not verify')
      }
      let event: Record<string, any>
      try {
        event = JSON.parse(raw)
      } catch {
        throw badRequest('BAD_JSON', 'Webhook body is not JSON')
      }
      // Razorpay sends a stable id per event across retries; fall back to a
      // hash of the body so a provider without one is still idempotent.
      const eventId =
        String(request.headers['x-razorpay-event-id'] ?? '') || createHash('sha256').update(raw).digest('hex')
      const result = await handleWebhookEvent(eventId, event)
      return reply.send({ ok: true, ...result })
    })
  })

  /* ── Finance ──────────────────────────────────────────────────────── */

  r.get(
    '/v1/admin/payments',
    {
      onRequest: [requireAuth, requireRole(...FIN_READ)],
      schema: {
        querystring: z.object({
          status: PaymentSchema.shape.status.optional(),
          limit: z.coerce.number().int().min(1).max(200).default(50),
        }),
      },
    },
    async (request) => listPayments(request.query.status, request.query.limit),
  )

  r.post(
    '/v1/admin/payments/:id/refund',
    {
      onRequest: [requireAuth, requireRole(...FIN)],
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: z.object({ amount: z.number().positive().optional(), reason: z.string().min(3).max(500) }).strict(),
      },
    },
    async (request) =>
      refundPayment(request.params.id, request.body.amount, request.body.reason, request.auth!.userId, request.auth!.role),
  )
}
