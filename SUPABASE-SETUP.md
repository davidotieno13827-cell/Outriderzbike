# Supabase setup

The website stays on GitHub Pages. Supabase provides email/password administrator sign-in and shared shop data. The owner will update photos directly in the Supabase dashboard instead of using a photo-posting form on the website.

The project URL is already saved in `supabase-config.js`:

`https://foplmhiqlcwqisyibord.supabase.co`

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

6. In **Authentication → URL Configuration**, set **Site URL** to `https://davidotieno13827-cell.github.io/Outriderzbike/`. Add that URL and `https://davidotieno13827-cell.github.io/Outriderzbike/**` to the allowed redirect URLs. The root page forwards invitation tokens to the shop app while preserving them.
7. If an invitation link already expired or opened `localhost:3000`, delete/resend the invitation after correcting the URL settings.
8. Open the invitation link. If it asks for an existing password, open the live shop, enter the admin email, and choose **Email me a password setup / reset link**. Follow the link emailed to you; it returns to the live shop where you can use **Set / Change Password** to create your password.

Only a signed-in account listed in `shop_admins` can see or use the admin dashboard. Visitors can read public bike listings, but cannot access customer IDs, hires, spare inventory, or make database changes.

## Update bike photos directly in Supabase

1. Upload the photo in **Storage → shop-photos**. Photos in this bucket are publicly readable so the public website can display them.
2. Copy the photo's public URL.
3. In **Table Editor → shop_content**, find the bike row (`collection` is `bikes` or `sale_bikes`) and update `data.image` to that URL. The website's public listings refresh live.

On the first authorized sign-in, the existing local bikes, spares, sale listings, customers, and hires are copied into Supabase. Customer and hire browser caches are then removed. The SQL policies keep customer IDs, hire records, and spare inventory admin-only.
