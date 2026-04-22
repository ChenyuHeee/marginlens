// Supabase Edge Function: trigger-ppt-workflow
// Triggered by the frontend after a ppt_job is created.
// Calls GitHub Actions workflow_dispatch so the PPT generates immediately
// instead of waiting for the cron schedule.
//
// Required Supabase secret (set once via CLI):
//   supabase secrets set GITHUB_TOKEN=<fine-grained PAT with Actions: write on this repo>
//
// Fine-grained PAT scopes needed:
//   - Permissions: Actions → Read and write
//   - Repository access: Only this repo (ChenyuHeee/marginlens)

import { createClient } from 'jsr:@supabase/supabase-js@2';

const REPO_OWNER = 'ChenyuHeee';
const REPO_NAME  = 'marginlens';
const WORKFLOW   = 'generate_ppt.yml';

Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, content-type',
      },
    });
  }

  // Require authenticated Supabase session (prevents anonymous abuse)
  const authHeader = req.headers.get('Authorization') ?? '';
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  const githubToken = Deno.env.get('GITHUB_TOKEN');
  if (!githubToken) {
    return new Response(JSON.stringify({ error: 'GITHUB_TOKEN not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  // Dispatch workflow_dispatch event
  const resp = await fetch(
    `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/actions/workflows/${WORKFLOW}/dispatches`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${githubToken}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ref: 'main' }),
    },
  );

  if (!resp.ok) {
    const body = await resp.text();
    return new Response(JSON.stringify({ error: `GitHub API error: ${resp.status} ${body}` }), {
      status: 502,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  // GitHub returns 204 No Content on success
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
});
