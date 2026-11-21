// www.harveycodes.com → harveycodes.com, keeping the path and query (so www.harveycodes.com/my-room still works).
// Deployed separately from the main site: cd redirect-www && npx wrangler deploy --config wrangler.jsonc
export default {
  fetch(request) {
    const url = new URL(request.url);
    url.hostname = "harveycodes.com";
    url.protocol = "https:";
    url.port = "";
    return Response.redirect(url.href, 301);
  },
};
