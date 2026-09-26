export const runtime = "nodejs";

// Pinned version plus Subresource Integrity hashes: the browser refuses to run the CDN files
// if their content ever differs from the published swagger-ui-dist 5.33.0 release.
const SWAGGER_UI_VERSION = "5.33.0";
const CDN = `https://cdn.jsdelivr.net/npm/swagger-ui-dist@${SWAGGER_UI_VERSION}`;
const CSS_INTEGRITY = "sha384-Ov4/wv3j2bmct8cDc5X4ngJZohVPzEmc6uDPH8WeljUxO5vtoykvMEfbu9Vh6RaW";
const JS_INTEGRITY = "sha384-YDALVcy8kj8yltLBVi1vBiBAUqdxvus673gM8XKwiy6aDUJFXivF/KCufekjYbVf";

// A plain HTML document instead of a React page: Swagger UI is a self-contained script, so
// there is nothing for React to render, and the app's layout and styles are not needed.
const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>IT Helpdesk Agent API</title>
    <link rel="stylesheet" href="${CDN}/swagger-ui.css" integrity="${CSS_INTEGRITY}" crossorigin="anonymous" />
  </head>
  <body>
    <div id="swagger-ui"></div>
    <noscript>Swagger UI needs JavaScript. The raw spec is at <a href="/api/openapi">/api/openapi</a>.</noscript>
    <script src="${CDN}/swagger-ui-bundle.js" integrity="${JS_INTEGRITY}" crossorigin="anonymous"></script>
    <script>
      window.ui = SwaggerUIBundle({ url: "/api/openapi", dom_id: "#swagger-ui" });
    </script>
  </body>
</html>
`;

export function GET(): Response {
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
