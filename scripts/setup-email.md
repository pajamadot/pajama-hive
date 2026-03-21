# Email Setup: pajama.cc

## Manual Setup (Cloudflare Dashboard)

Our API token doesn't have Email Routing permissions, so this must be done in the dashboard.

### Steps:

1. **Go to**: https://dash.cloudflare.com → select **pajama.cc** domain

2. **Navigate to**: Email → Email Routing

3. **Enable Email Routing** (if not already enabled)
   - Cloudflare will auto-add MX and TXT (SPF) DNS records

4. **Add Destination Address**:
   - Click "Add destination address"
   - Enter your real email (e.g., `radiantclay@gmail.com`)
   - Check your inbox for the verification email from Cloudflare
   - Click the verification link

5. **Create Routing Rules** (choose one):

   **Option A: Catch-all** (recommended for testing)
   - Click "Catch-all address" → Enable
   - Action: Forward to → your verified destination
   - This forwards ALL `*@pajama.cc` emails to your real inbox

   **Option B: Specific addresses**
   - Click "Create address"
   - Custom address: `test` (creates `test@pajama.cc`)
   - Action: Forward to → your verified destination
   - Repeat for: `noreply@pajama.cc`, `support@pajama.cc`, etc.

6. **Verify DNS** — Cloudflare should auto-add:
   ```
   MX   pajama.cc    route1.mx.cloudflare.net    Priority: 69
   MX   pajama.cc    route2.mx.cloudflare.net    Priority: 12
   MX   pajama.cc    route3.mx.cloudflare.net    Priority: 93
   TXT  pajama.cc    v=spf1 include:_spf.mx.cloudflare.net ~all
   ```

### Testing

After setup, send an email to `test@pajama.cc` — it should arrive in your real inbox within seconds.

### For API Access Later

To manage email routing programmatically, create a new API token:
- https://dash.cloudflare.com/profile/api-tokens
- Template: "Edit Cloudflare Workers" + add:
  - Zone > Email Routing Rules > Edit
  - Zone > Email Routing Addresses > Edit

### Usage in Pajama Hive

Once set up, we can use `test@pajama.cc` for:
- Clerk email testing (sign up/reset flows)
- Webhook delivery verification
- Human-in-the-loop approval notifications
- CI/CD notification emails
