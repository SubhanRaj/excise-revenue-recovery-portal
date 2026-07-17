import { NextRequest, NextResponse } from "next/server";

type Handler = (req: NextRequest) => Promise<NextResponse>;

// Wraps a route handler so an unexpected error (a D1 blip, a thrown exception from a third-party
// call like Resend) comes back as this app's own `{ error }` JSON 500 instead of bubbling up to
// the framework's default response — see ROADMAP.md's "Retrofit proper try/catch" backlog item
// for why this exists. Doesn't replace a route's own validation/expected-error responses (400,
// 401, 404, 409, ...) — those are ordinary early `return`s from inside the handler and pass
// through untouched; this only catches what nothing anticipated. `routeName` is just a label for
// the server log line, not shown to the client.
export function withErrorHandling(routeName: string, handler: Handler): Handler {
  return async (req) => {
    try {
      return await handler(req);
    } catch (err) {
      console.error(`${routeName} failed:`, err);
      return NextResponse.json({ error: "Something went wrong — please try again." }, { status: 500 });
    }
  };
}
