# Supabase setup

The website stays on GitHub Pages. Supabase provides email/password administrator sign-in and shared shop data. The owner will update photos directly in the Supabase dashboard instead of using a photo-posting form on the website.

The project URL is already saved in `supabase-config.js`:

`https://foplmhiqlcwqisyibord.supabase.co`

When adding or editing a bike for sale in Admin, enter its category (for example, `Shimano` or `Type B`). The public home page creates category filter buttons from the listed bikes, so visitors can show all bikes or filter to one category. Existing sale listings without a category appear under `Uncategorized`.

## Secure the custom domain

The production domain is `outridersbikeshop.co.ke`, managed at Truehost Kenya. Verify ownership with GitHub before connecting DNS; this reduces the risk of someone else claiming the domain for another GitHub Pages site.

1. In GitHub **Profile → Settings → Pages**, add `outridersbikeshop.co.ke` and follow the verification prompt. At Truehost, add the exact TXT record GitHub gives you. Wait for GitHub to show the domain as verified.
2. In this repository, open **Settings → Pages** and set the custom domain to `outridersbikeshop.co.ke`. Keep the site on GitHub Pages and wait for the HTTPS certificate to become available.
3. At Truehost DNS, create these records for the apex (`@`) domain:

   | Type | Host | Value |
   |---|---|---|
   | A | `@` | `185.199.108.153` |
   | A | `@` | `185.199.109.153` |
   | A | `@` | `185.199.110.153` |
   | A | `@` | `185.199.111.153` |
   | CNAME | `www` | `davidotieno13827-cell.github.io` |

   Remove conflicting existing A/AAAA/CNAME records for `@` or `www`; do not create wildcard (`*`) DNS records. DNS propagation can take up to 24 hours.
4. After GitHub Pages reports the domain is ready, enable **Enforce HTTPS** in repository **Settings → Pages**.
5. In Supabase **Authentication → URL Configuration**, once HTTPS works, set **Site URL** to `https://outridersbikeshop.co.ke/`. Add these exact URLs to allowed redirect URLs while switching over:

   ```text
   https://outridersbikeshop.co.ke/
   https://davidotieno13827-cell.github.io/Outriderzbike/
   ```

   The password-reset flow redirects to the same host the owner is currently using. Remove old `localhost` entries from the production allowlist if they are not needed for local development.

## Connect and secure the admin

1. In Supabase **Project Settings → API**, copy the public `anon` / `publishable` key into `anonKey` in `supabase-config.js`. This key is intended for browser use. **Never use or publish the `service_role` key.**
2. Open **SQL Editor** and run the contents of `supabase-setup.sql`.
3. In **Authentication → Providers → Email**, leave email/password sign-in enabled and turn off public sign-ups.
4. Invite `davidotieno13827@gmail.com` in **Authentication → Users**. The owner will create their password from the website after accepting the invitation; do not put a password in the website source.
5. After the invite, run this in the SQL Editor to grant the owner administrator access:

   ```sql
   insert into public.shop_admins (user_id)
   select id from auth.users where email = 'davidotieno13827@gmail.com'
   on conflict do nothing;
   ```

6. Until the custom domain has HTTPS, keep the current GitHub Pages URL as Supabase's **Site URL** and an allowed redirect. After HTTPS is enabled, follow **Secure the custom domain** above and change the Site URL.
7. If an invitation link already expired or opened `localhost:3000`, delete/resend the invitation after correcting the URL settings.
8. Open the invitation link. If it asks for an existing password, open the live shop, enter the admin email, and choose **Email me a password setup / reset link**. Follow the link emailed to you; the shop will show fields to enter and confirm a new password.

The public navigation does not show an Admin button. The owner can bookmark `https://outridersbikeshop.co.ke/?admin` to open the sign-in screen. This less-visible link is not an access control: only a signed-in account listed in `shop_admins` can use the admin dashboard. Visitors can read public bike listings, but cannot access customer IDs, hires, spare inventory, or make database changes; Supabase authentication and row-level security enforce those permissions.

## Update bike photos directly in Supabase

1. Upload the photo in **Storage → shop-photos**. Photos in this bucket are publicly readable so the public website can display them.
2. Copy the photo's public URL.
3. In **Table Editor → shop_content**, find the bike row (`collection` is `bikes` or `sale_bikes`) and update `data.image` to that URL. The website's public listings refresh live.

On the first authorized sign-in, the existing local bikes, spares, sale listings, customers, and hires are copied into Supabase. Customer and hire browser caches are then removed. The SQL policies keep customer IDs, hire records, and spare inventory admin-only.
