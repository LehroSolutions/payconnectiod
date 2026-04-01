function registerRootRoutes(router) {
  router.register("GET", "/", async ({ response, readAppHtml }) => {
    const html = await readAppHtml();
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(html);
  });
}

export { registerRootRoutes };
