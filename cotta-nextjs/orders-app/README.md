# TableFlow backend modules

This directory contains shared MongoDB/Mongoose business logic and the menu/admin/kitchen UI served by Next.js App Router at `/order`. Run `npm run dev` from the parent Next.js project. All routes use port 3000. No separate service is needed.

The `server.mjs` file is a test-only harness. Production imports `service.mjs` through `app/order/[[...path]]/route.js`. See the root README for Vercel deployment.
