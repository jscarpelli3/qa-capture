import { redirect } from "next/navigation";
import { getServerEnv } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

async function signInWithGoogle() {
  "use server";
  const supabase = await createSupabaseServerClient();
  const env = getServerEnv();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${env.NEXT_PUBLIC_APP_URL}/auth/callback?next=/dashboard` },
  });
  if (error || !data.url) redirect("/auth/error");
  redirect(data.url);
}

export default function LoginPage() {
  return (
    <main className="centered"><section className="panel">
      <p className="eyebrow">Developer access</p><h1>Sign in to QA Capture.</h1>
      <p>Google verifies your identity. Drive access is never requested here.</p>
      <form action={signInWithGoogle}><button className="button" type="submit">Continue with Google</button></form>
    </section></main>
  );
}
