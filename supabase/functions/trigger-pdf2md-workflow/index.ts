// Supabase Edge Function: trigger-pdf2md-workflow
// Called by the frontend after a pdf2md_job is created.
// Dispatches the convert_pdf2md GitHub Actions workflow immediately.
// No user auth check needed — GITHUB_TOKEN secret is sufficient protection.

const REPO_OWNER = 'ChenyuHeee';
const REPO_NAME  = 'marginlens';
const WORKFLOW   = 'convert_pdf2md.yml';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
      },
    });
  }

  const githubToken = Deno.env.get('GITHUB_TOKEN');
  if (!githubToken) {
    return new Response(JSON.stringify({ error: 'GITHUB_TOKEN not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

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

  const status = resp.ok ? 200 : resp.status;
  const body = resp.ok
    ? { ok: true }
    : { error: `GitHub API ${resp.status}: ${await resp.text()}` };

  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
});
