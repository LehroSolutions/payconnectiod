function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function compilePath(pathPattern) {
  const keys = [];
  const pattern = pathPattern
    .split("/")
    .map((segment) => {
      if (!segment) return "";
      if (segment.startsWith(":")) {
        keys.push(segment.slice(1));
        return "([^/]+)";
      }
      return escapeRegex(segment);
    })
    .join("/");

  return {
    keys,
    regex: new RegExp(`^${pattern}$`)
  };
}

class Router {
  constructor() {
    this.routes = [];
  }

  register(method, path, handler, options = {}) {
    const { regex, keys } = compilePath(path);
    this.routes.push({ method, path, handler, authScope: options.authScope ?? null, regex, keys });
  }

  match(method, path) {
    for (const route of this.routes) {
      if (route.method !== method) continue;
      const match = route.regex.exec(path);
      if (!match) continue;

      const params = {};
      for (let index = 0; index < route.keys.length; index += 1) {
        params[route.keys[index]] = decodeURIComponent(match[index + 1]);
      }
      return { route, params };
    }

    return null;
  }
}

export { Router };
