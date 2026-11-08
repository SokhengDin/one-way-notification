// What the demo systems send: events, their templates per channel, and a
// realistic payload for each. Templates use the real engine syntax, so they
// render in the dashboard preview and in real sends.

export type Channel = "email" | "sms" | "telegram";

export interface EventSpec {
  readonly event:     string;
  readonly weight:    number;
  readonly email?:    { readonly subject: string; readonly body: string };
  readonly sms?:      string;
  readonly telegram?: string;
  readonly payload:   (r: Rand) => Record<string, unknown>;
}

export interface SystemSpec {
  readonly name:   string;
  readonly weight: number;
  readonly events: ReadonlyArray<EventSpec>;
}

export interface Rand {
  readonly pick:    <T>(items: ReadonlyArray<T>) => T;
  readonly between: (min: number, max: number) => number;
  readonly first:   string;
}

// ---------- shared bits ----------

const button = (href: string, label: string) =>
  `<p style="margin:24px 0"><a href="${href}" style="background:#2563EB;color:#ffffff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600">${label}</a></p>`;

const muted = (text: string) => `<p style="color:#64748B;font-size:13px">${text}</p>`;

const euros = (r: Rand, min: number, max: number) => `€${(r.between(min * 100, max * 100) / 100).toFixed(2)}`;
const code  = (r: Rand, prefix: string, digits = 5) => `${prefix}-${String(r.between(10 ** (digits - 1), 10 ** digits - 1))}`;
const day   = (r: Rand) => r.pick(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]);

const PRODUCTS = ["Linen shirt", "Ceramic mug set", "Wireless earbuds", "Running shoes", "Desk lamp", "Rice cooker", "Yoga mat", "Backpack"];
const CITIES   = ["Paris", "Lyon", "Phnom Penh", "Évry", "Marseille", "Siem Reap", "Lille"];
const DEVICES  = ["Chrome on Windows", "Safari on iPhone", "Firefox on Ubuntu", "Edge on Windows", "the Android app"];

// ---------- catalogue ----------

export const SYSTEMS: ReadonlyArray<SystemSpec> = [
  {
    name:   "Demo Shop",
    weight: 0.45,
    events: [
      {
        event:  "order.confirmed",
        weight: 3,
        email: {
          subject: "Order {{order_id}} confirmed",
          body: `<h1>Thanks for your order, {{name}}!</h1>
<p>We've received order <strong>{{order_id}}</strong> for <strong>{{item}}</strong> ({{total}}). We'll let you know as soon as it ships.</p>
${button("https://shop.demo.test/orders/{{order_id}}", "View your order")}
${muted("Questions? Just reply to this email.")}`,
        },
        sms:      "{{system.name}}: order {{order_id}} confirmed ({{total}}). We'll text you when it ships.",
        payload:  (r) => ({ name: r.first, order_id: code(r, "A"), item: r.pick(PRODUCTS), total: euros(r, 12, 240) }),
      },
      {
        event:  "order.shipped",
        weight: 3,
        email: {
          subject: "Your order {{order_id}} is on its way",
          body: `<h1>Good news, {{name}}</h1>
<p>Your <strong>{{item}}</strong> left our warehouse and should arrive on <strong>{{eta}}</strong>.</p>
<p>Carrier: {{carrier}} · tracking number <code>{{tracking}}</code></p>
${button("https://track.demo.test/{{tracking}}", "Track your parcel")}`,
        },
        sms:      "Your {{system.name}} order {{order_id}} has shipped. Track it: https://track.demo.test/{{tracking}}",
        telegram: "📦 <b>Order {{order_id}} shipped</b>\nArriving {{eta}} with {{carrier}}.\nTracking: <code>{{tracking}}</code>",
        payload:  (r) => ({ name: r.first, order_id: code(r, "A"), item: r.pick(PRODUCTS), eta: day(r), carrier: r.pick(["Colissimo", "DHL", "Chronopost", "UPS"]), tracking: code(r, "TRK", 8) }),
      },
      {
        event:  "order.delivered",
        weight: 2,
        email: {
          subject: "Delivered: {{item}}",
          body: `<p>Hi {{name}},</p>
<p>Your order <strong>{{order_id}}</strong> was delivered{{ note | default: "" }}. We hope you love it.</p>
${button("https://shop.demo.test/orders/{{order_id}}/review", "Leave a review")}`,
        },
        payload: (r) => ({ name: r.first, order_id: code(r, "A"), item: r.pick(PRODUCTS), note: r.pick(["", " to your mailbox", " to the pick-up point"]) }),
      },
      {
        event:  "cart.reminder",
        weight: 2,
        email: {
          subject: "{{name}}, you left something in your cart",
          body: `<p>Still thinking about the <strong>{{item}}</strong>?</p>
<p>It's waiting in your cart for {{price}}. Stock is limited.</p>
${button("https://shop.demo.test/cart", "Back to my cart")}
${muted("You get this because you're signed up to cart reminders. You can turn them off in your account.")}`,
        },
        payload: (r) => ({ name: r.first, item: r.pick(PRODUCTS), price: euros(r, 9, 180) }),
      },
    ],
  },
  {
    name:   "Demo Billing",
    weight: 0.2,
    events: [
      {
        event:  "invoice.paid",
        weight: 2,
        email: {
          subject: "Receipt for invoice {{invoice}}",
          body: `<p>Hi {{name}},</p>
<p>We received your payment of <strong>{{amount}}</strong> for invoice <strong>{{invoice}}</strong>. Thank you!</p>
<table style="width:100%;border-collapse:collapse;font-size:14px">
<tr><td style="padding:6px 0;color:#64748B">Invoice</td><td style="text-align:right">{{invoice}}</td></tr>
<tr><td style="padding:6px 0;color:#64748B">Paid with</td><td style="text-align:right">{{method}}</td></tr>
<tr><td style="padding:6px 0;color:#64748B">Amount</td><td style="text-align:right"><strong>{{amount}}</strong></td></tr>
</table>`,
        },
        payload: (r) => ({ name: r.first, invoice: code(r, "INV", 6), amount: euros(r, 19, 900), method: r.pick(["Visa ending 4417", "Mastercard ending 0932", "SEPA transfer", "ABA Pay"]) }),
      },
      {
        event:  "invoice.overdue",
        weight: 1,
        email: {
          subject: "Invoice {{invoice}} is {{days}} days overdue",
          body: `<p>Hi {{name}},</p>
<p>Invoice <strong>{{invoice}}</strong> for <strong>{{amount}}</strong> was due {{days}} days ago.</p>
${button("https://billing.demo.test/pay/{{invoice}}", "Pay now")}
${muted("Already paid? Thanks, you can ignore this message.")}`,
        },
        sms:     "{{system.name}}: invoice {{invoice}} ({{amount}}) is {{days}} days overdue. Pay: https://billing.demo.test/pay/{{invoice}}",
        payload: (r) => ({ name: r.first, invoice: code(r, "INV", 6), amount: euros(r, 19, 900), days: r.between(3, 30) }),
      },
      {
        event:  "subscription.renewing",
        weight: 1,
        email: {
          subject: "Your {{plan}} plan renews on {{date}}",
          body: `<p>Hi {{name}},</p>
<p>Your <strong>{{plan}}</strong> subscription renews on <strong>{{date}}</strong> for {{amount}}. Nothing to do if you want to keep it.</p>
${button("https://billing.demo.test/subscription", "Manage subscription")}`,
        },
        payload: (r) => ({ name: r.first, plan: r.pick(["Starter", "Pro", "Team"]), date: `${r.between(1, 28)} ${r.pick(["Dec", "Jan", "Feb"])}`, amount: euros(r, 9, 99) }),
      },
    ],
  },
  {
    name:   "Demo Auth",
    weight: 0.2,
    events: [
      {
        event:  "password.reset",
        weight: 2,
        email: {
          subject: "Reset your password",
          body: `<p>Hi {{name}},</p>
<p>Someone asked to reset the password of your {{system.name}} account. If it was you, use the button below. The link works for 30 minutes.</p>
${button("https://auth.demo.test/reset?token={{token}}", "Choose a new password")}
${muted("Didn't ask for this? Ignore this email; your password stays the same.")}`,
        },
        payload: (r) => ({ name: r.first, token: code(r, "rst", 8) }),
      },
      {
        event:  "login.alert",
        weight: 2,
        email: {
          subject: "New sign-in from {{device}}",
          body: `<p>Hi {{name}},</p>
<p>Your account was just used to sign in from <strong>{{device}}</strong> near <strong>{{city}}</strong>.</p>
<p>If this was you, there's nothing to do. If not, secure your account now.</p>
${button("https://auth.demo.test/security", "Review activity")}`,
        },
        telegram: "🔐 New sign-in to {{system.name}}\n<b>{{device}}</b> near {{city}}.\nNot you? Change your password now.",
        payload:  (r) => ({ name: r.first, device: r.pick(DEVICES), city: r.pick(CITIES) }),
      },
      {
        event:  "otp.requested",
        weight: 3,
        sms:      "Your {{system.name}} code is {{code}}. It expires in 5 minutes. Never share it.",
        telegram: "Your {{system.name}} code: <code>{{code}}</code> (expires in 5 minutes)",
        payload:  (r) => ({ code: String(r.between(100000, 999999)) }),
      },
      {
        event:  "email.verify",
        weight: 1,
        email: {
          subject: "Confirm your email address",
          body: `<h1>Welcome, {{name}}!</h1>
<p>Confirm this is your email address to finish setting up your {{system.name}} account.</p>
${button("https://auth.demo.test/verify?token={{token}}", "Confirm my email")}`,
        },
        payload: (r) => ({ name: r.first, token: code(r, "ver", 8) }),
      },
    ],
  },
  {
    name:   "Demo Clinic",
    weight: 0.15,
    events: [
      {
        event:  "appointment.reminder",
        weight: 3,
        email: {
          subject: "Reminder: {{service}} on {{date}} at {{time}}",
          body: `<p>Hello {{name}},</p>
<p>This is a reminder of your <strong>{{service}}</strong> appointment with <strong>{{doctor}}</strong> on <strong>{{date}} at {{time}}</strong>.</p>
<p>Please arrive 10 minutes early and bring your health card.</p>
${button("https://clinic.demo.test/appointments", "Reschedule or cancel")}`,
        },
        sms:      "Reminder: {{service}} with {{doctor}} on {{date}} at {{time}}. Reply C to cancel.",
        telegram: "🩺 <b>Appointment reminder</b>\n{{service}} with {{doctor}}\n{{date}} at {{time}}",
        payload:  (r) => ({ name: r.first, service: r.pick(["Check-up", "Dental cleaning", "Eye exam", "Physiotherapy"]), doctor: `Dr ${r.pick(["Martin", "Sok", "Bernard", "Chan", "Leroy"])}`, date: `${day(r)} ${r.between(1, 28)} Nov`, time: `${r.between(8, 17)}:${r.pick(["00", "15", "30", "45"])}` }),
      },
      {
        event:  "results.available",
        weight: 1,
        email: {
          subject: "Your results are ready",
          body: `<p>Hello {{name}},</p>
<p>The results of your {{test}} are now available in your patient space. For your privacy, we never send results by email.</p>
${button("https://clinic.demo.test/results", "Open my patient space")}`,
        },
        payload: (r) => ({ name: r.first, test: r.pick(["blood test", "X-ray", "allergy test"]) }),
      },
    ],
  },
];

export function channelsOf(spec: EventSpec): ReadonlyArray<Channel> {
  return [
    ...(spec.email ? (["email"] as const) : []),
    ...(spec.sms ? (["sms"] as const) : []),
    ...(spec.telegram ? (["telegram"] as const) : []),
  ];
}
