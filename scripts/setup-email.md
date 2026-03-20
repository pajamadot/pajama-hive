# Email Setup: pajama.cc

The Cloudflare API token in `secrets/cloudflare.env` doesn't have Email Routing permissions.
Set this up manually in the Cloudflare dashboard:

1. Go to https://dash.cloudflare.com → pajama.cc → Email → Email Routing
2. Click "Enable Email Routing"
3. Add a destination address (your real email to forward to)
4. Verify the destination address via the email Cloudflare sends
5. Create routing rules:
   - `test@pajama.cc` → forward to your verified destination
   - OR set up a catch-all rule: `*@pajama.cc` → forward to destination

DNS records will be auto-configured (MX + TXT for SPF).

## For API access
To manage email routing via API, create a new API token at:
https://dash.cloudflare.com/profile/api-tokens

Include these permissions:
- Zone > Email Routing Rules > Edit
- Zone > Email Routing Addresses > Edit
- Zone > DNS > Edit (for MX records)
