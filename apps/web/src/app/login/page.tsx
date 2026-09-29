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
      <div className="panelIndex" aria-hidden="true">ACCESS<br />/01</div>
      <h1>Sign<br />in.</h1>
      <p className="panelNote">Google verifies your identity.<br />Drive access is never requested here.</p>
      <form action={signInWithGoogle}><button className="button" type="submit">Continue with Google</button></form>
    </section></main>
  );
}
