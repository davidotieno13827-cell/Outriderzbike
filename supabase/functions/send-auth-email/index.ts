import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";
import { createClient } from "npm:@supabase/supabase-js@2";

type AuthEmailPayload = {
  user: {
    id: string;
    email?: string;
    new_email?: string;
  };
  email_data: {
    token?: string;
    token_hash?: string;
    redirect_to?: string;
    email_action_type: string;
    site_url?: string;
    token_new?: string;
    token_hash_new?: string;
  };
};

const authUrl = Deno.env.get("SUPABASE_URL") ?? "";
const secretKeys = Deno.env.get("SUPABASE_SECRET_KEYS");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  ?? (secretKeys ? JSON.parse(secretKeys).default as string | undefined : undefined)
  ?? "";
const resendApiKey = Deno.env.get("RESEND_API_KEY") ?? "";
const sender = Deno.env.get("AUTH_EMAIL_FROM") ?? "";
const hookSecret = Deno.env.get("SEND_EMAIL_HOOK_SECRET")?.replace(/^v1,whsec_/, "") ?? "";

const jsonHeaders = { "Content-Type": "application/json" };

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function makeVerificationUrl(
  tokenHash: string,
  type: string,
  redirectTo: string,
) {
  const url = new URL("/auth/v1/verify", authUrl);
  url.searchParams.set("token", tokenHash);
  url.searchParams.set("type", type);
  url.searchParams.set("redirect_to", redirectTo);
  return url.toString();
}

async function sendEmail(to: string, subject: string, html: string, text: string) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: sender, to: [to], subject, html, text }),
  });

  if (!response.ok) {
    console.error("Resend rejected an Auth email.", response.status);
    throw new Error("Auth email provider rejected the message.");
  }
}

async function sendActionEmail(
  to: string,
  tokenHash: string,
  type: string,
  redirectTo: string,
  token?: string,
) {
  const actions: Record<string, {
    subject: string;
    title: string;
    description: string;
    button: string;
  }> = {
    recovery: {
      subject: "Reset your Outriders Bike Shop password",
      title: "Reset your password",
      description: "We received a request to reset your administrator password.",
      button: "Reset password",
    },
    invite: {
      subject: "Your Outriders Bike Shop admin invitation",
      title: "You have been invited",
      description: "Follow this link to accept your administrator invitation.",
      button: "Accept invitation",
    },
    signup: {
      subject: "Confirm your Outriders Bike Shop account",
      title: "Confirm your email",
      description: "Follow this link to confirm your email address.",
      button: "Confirm email",
    },
    magiclink: {
      subject: "Your Outriders Bike Shop sign-in link",
      title: "Sign in to Outriders Bike Shop",
      description: "Use this one-time link to sign in.",
      button: "Sign in",
    },
    email: {
      subject: "Confirm your Outriders Bike Shop email",
      title: "Confirm your email",
      description: "Follow this link to confirm your email address.",
      button: "Confirm email",
    },
    email_change: {
      subject: "Confirm your Outriders Bike Shop email",
      title: "Confirm your new email",
      description: "Follow this link to confirm your new email address.",
      button: "Confirm email",
    },
  };
  const action = actions[type];

  const confirmationUrl = makeVerificationUrl(tokenHash, type, redirectTo);
  const safeUrl = escapeHtml(confirmationUrl);

  if (type === "reauthentication" && token) {
    await sendEmail(
      to,
      "Your Outriders Bike Shop verification code",
      `<h2>Your verification code</h2><p>Enter this code to verify your identity:</p><p><strong>${escapeHtml(token)}</strong></p>`,
      `Your verification code is ${token}.`,
    );
    return;
  }

  if (!action) {
    throw new Error(`Unsupported Auth email action: ${type}`);
  }

  const html = `<h2>${action.title}</h2><p>${action.description}</p><p><a href="${safeUrl}">${action.button}</a></p><p>If you did not request this, you can ignore this email.</p>`;
  const text = `${action.title}\n\n${action.description}\n\n${confirmationUrl}\n\nIf you did not request this, you can ignore this email.`;
  await sendEmail(to, action.subject, html, text);
}

async function sendNotification(to: string, type: string) {
  const descriptions: Record<string, string> = {
    password_changed_notification: "The password for your account was changed.",
    email_changed_notification: "The email address for your account was changed.",
    phone_changed_notification: "The phone number for your account was changed.",
    identity_linked_notification: "A sign-in identity was linked to your account.",
    identity_unlinked_notification: "A sign-in identity was removed from your account.",
    mfa_factor_enrolled_notification: "A multi-factor authentication method was added to your account.",
    mfa_factor_unenrolled_notification: "A multi-factor authentication method was removed from your account.",
  };
  const description = descriptions[type];
  if (!description) throw new Error(`Unsupported Auth email action: ${type}`);
  await sendEmail(
    to,
    "Security notification from Outriders Bike Shop",
    `<p>${description}</p><p>If you did not make this change, contact the shop administrator immediately.</p>`,
    `${description}\n\nIf you did not make this change, contact the shop administrator immediately.`,
  );
}

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return jsonResponse({ error: { message: "Method not allowed." } }, 405);
  }

  if (!authUrl || !serviceRoleKey || !resendApiKey || !sender || !hookSecret) {
    console.error("Auth email hook is missing required server configuration.");
    return jsonResponse({ error: { message: "Auth email delivery is not configured." } }, 500);
  }

  let payload: AuthEmailPayload;
  try {
    const rawBody = await request.text();
    const webhook = new Webhook(hookSecret);
    payload = webhook.verify(rawBody, Object.fromEntries(request.headers)) as AuthEmailPayload;
  } catch {
    return jsonResponse({ error: { message: "Invalid Auth hook signature." } }, 401);
  }

  const { user, email_data: emailData } = payload;
  if (!user?.id || !user.email || !emailData?.email_action_type) {
    return jsonResponse({ error: { message: "Invalid Auth email payload." } }, 400);
  }

  try {
    if (emailData.email_action_type === "recovery") {
      const supabaseAdmin = createClient(authUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { data: admin, error } = await supabaseAdmin
        .from("shop_admins")
        .select("user_id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) throw new Error("Could not verify shop administrator authorization.");
      if (!admin) return jsonResponse({});
    }

    if (emailData.email_action_type === "email_change") {
      const redirectTo = emailData.redirect_to || emailData.site_url || "https://outridersbikeshop.co.ke/";
      if (emailData.token_hash_new && emailData.token && user.email) {
        await sendActionEmail(user.email, emailData.token_hash_new, "email_change", redirectTo);
      }
      if (emailData.token_hash && user.new_email) {
        await sendActionEmail(user.new_email, emailData.token_hash, "email_change", redirectTo);
      }
    } else if (emailData.email_action_type.endsWith("_notification")) {
      await sendNotification(user.email, emailData.email_action_type);
    } else if (emailData.token_hash) {
      await sendActionEmail(
        user.email,
        emailData.token_hash,
        emailData.email_action_type,
        emailData.redirect_to || emailData.site_url || "https://outridersbikeshop.co.ke/",
        emailData.token,
      );
    } else {
      throw new Error("Auth email payload did not contain a token.");
    }

    return jsonResponse({});
  } catch (error) {
    console.error(
      "Auth email hook failed.",
      error instanceof Error ? error.message : "Unknown error.",
    );
    return jsonResponse({ error: { message: "Could not send the Auth email." } }, 500);
  }
});
