# MyDriver Admin CRM & Safety Desk Technical Specification

## 1. Overview & Operational Role

The Admin CRM is a web application serving two operational groups:
1. **24x7 Safety Desk Agents**: Real-time monitoring of all active night trips, L0–L5 escalation processing, and emergency dispatch.
2. **Operations & Business Analysts**: Driver onboarding approval, fleet management, corporate account management, and financial reconciliation.

---

## 2. Safety Desk Live Board (Command Center)

```
+-----------------------------------------------------------------------------------+
|  MYDRIVER SAFETY DESK LIVE BOARD                       [Active Night Trips: 42]   |
+------------------------------------+----------------------------------------------+
| LIVE MAP FEED                      | ESCALATION QUEUE                             |
|                                    | [!] L3 Escalation: Trip #8492 - 2 min ago     |
| [Map View showing vehicle markers] |     Driver: Ramesh K. | Customer: Priya S.   |
| Green = Normal                     |     Action: Attempting IVR & Direct Call    |
| Yellow = L1 Anomaly                |                                              |
| Red = L3/L4 Active Alert           | [!] L1 Warning: Speed Ceiling Breach #8499    |
|                                    |     Speed: 88 km/h (Ceiling: 70 km/h)      |
+------------------------------------+----------------------------------------------+
| ACTIVE TRIP STREAM DETAILS                                                        |
| Trip #8492 | Route: Jubilee Hills -> Gachibowli | GPS Delta: 220m [UNUSUAL STOP]      |
| Telematics: Normal braking | Guardian Status: Link Shared & Active                |
+-----------------------------------------------------------------------------------+
```

### Key Functional Components
- **Real-Time Map View (Mapbox GL JS)**: WebSocket-driven updates rendered at 60fps for all active vehicles.
- **Incident Escalation Queue**:
  - Auto-prioritizes trips based on escalation tier (`L0` to `L5`).
  - Strict SLA timer ($<3$ minutes from L2 to human agent contact).
- **One-Click Actions**:
  - Initiate IVR / direct call to Driver or Customer.
  - Push emergency SMS to designated Guardian contacts.
  - Release Trip Vault evidence packet to official law enforcement channels (Dial 112 / T-Safe).

---

## 3. Technology Stack & Security

- **Frontend**: React 19 + Tailwind CSS + Vite + Lucide Icons + Mapbox GL JS.
- **Real-Time Layer**: WebSockets (`socket.io-client` with auto-reconnect and heartbeat).
- **Authentication & RBAC**: Role-Based Access Control enforcing strict separation (`SAFETY_DESK_AGENT`, `OPS_MANAGER`, `FINANCE`, `SUPER_ADMIN`).
- **Audit Logging**: Every action taken on the Safety Desk (e.g., viewing live camera feeds or accessing Trip Vault records) is logged immutably to an append-only audit ledger.
