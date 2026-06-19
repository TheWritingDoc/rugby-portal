// Vercel serverless entry point.
//
// Vercel turns every file under /api into a function. We import the existing
// Express app (which, when imported rather than run directly, does not bind a
// port) and hand it to Vercel as the request handler. vercel.json rewrites all
// /api/* requests here.
import app from '../server/index-sqlite.js'

export default app
