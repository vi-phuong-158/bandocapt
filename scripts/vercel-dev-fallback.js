// vercel.json devCommand: this project has no frontend framework, so `vercel dev`'s own
// built-in server already handles every route directly (static files + api/* functions).
// Without an explicit devCommand, Vercel CLI infers `npm run dev` (the Tailwind --watch
// script) as the dev server, which never exits and hangs `vercel dev` forever. A devCommand
// must also stay alive — a one-shot command (e.g. `echo`) makes `vercel dev` error out.
// This is a minimal long-running placeholder that only ever answers requests vercel dev
// could not already resolve itself, which in practice never happens for this project.
require('node:http')
    .createServer((_req, res) => {
        res.statusCode = 404;
        res.end();
    })
    .listen(process.env.PORT);
