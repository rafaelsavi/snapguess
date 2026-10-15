/**
 * Client-Side Router for SnapGuess
 * Manages deep links, History API (pushState/popstate), and navigation guards.
 */

let currentRouteHandler = null;
let navigationGuardFn = null;
let currentPath = window.location.pathname;

export const RouteType = {
  LOBBY: "LOBBY",
  GAME_ACTIVE: "GAME_ACTIVE",
  GAME_SUMMARY: "GAME_SUMMARY",
  GAME_REPLAY: "GAME_REPLAY",
  CHALLENGE: "CHALLENGE",
  CHALLENGE_SUMMARY: "CHALLENGE_SUMMARY",
  CHALLENGES: "CHALLENGES",
  REPORTED: "REPORTED",
  PLAYERS: "PLAYERS",
  STATS: "PLAYERS",
  REPLAYS: "REPLAYS",
  PLAYER_PROFILE: "PLAYER_PROFILE",
  UNKNOWN: "UNKNOWN",
};

/**
 * Minimum role required for each route type.
 * Routes not listed default to "guest" (public).
 */
export const ROUTE_MIN_ROLES = {
  [RouteType.LOBBY]: "guest",
  [RouteType.GAME_ACTIVE]: "guest",
  [RouteType.GAME_SUMMARY]: "guest",
  [RouteType.CHALLENGE]: "guest",
  [RouteType.CHALLENGE_SUMMARY]: "guest",
  [RouteType.CHALLENGES]: "user",
  [RouteType.PLAYERS]: "user",
  [RouteType.PLAYER_PROFILE]: "user",
  [RouteType.REPLAYS]: "user",
  [RouteType.GAME_REPLAY]: "user",
  [RouteType.REPORTED]: "creator",
};

const _ROLE_LEVELS = { guest: 0, user: 1, creator: 2 };

/**
 * Check if a role string meets the minimum requirement for a route type.
 * @param {string} routeType - A RouteType value
 * @param {string} role - "guest", "user", or "creator"
 * @returns {boolean}
 */
export function canAccessRoute(routeType, role) {
  const minRole = ROUTE_MIN_ROLES[routeType] || "guest";
  return (_ROLE_LEVELS[role] ?? 0) >= (_ROLE_LEVELS[minRole] ?? 0);
}


const ROUTE_DEFINITIONS = [
  {
    type: RouteType.LOBBY,
    pattern: /^\/$/,
    canonicalPath: () => "/",
  },
  {
    type: RouteType.PLAYER_PROFILE,
    pattern: /^\/players\/([^/]+)$/,
    paramKeys: ["playerName"],
    canonicalPath: (params) => `/players/${encodeURIComponent(params.playerName)}`,
  },
  {
    type: RouteType.PLAYERS,
    pattern: /^\/players\/?$/,
    canonicalPath: () => "/players",
  },
  {
    type: RouteType.REPLAYS,
    pattern: /^\/replays\/?$/,
    canonicalPath: () => "/replays",
  },
  {
    type: RouteType.GAME_REPLAY,
    pattern: /^\/game\/([^/]+)\/replay$/,
    paramKeys: ["matchId"],
    canonicalPath: (params) => `/game/${params.matchId}/replay`,
  },
  {
    type: RouteType.CHALLENGES,
    pattern: /^\/challenges\/?$/,
    canonicalPath: () => "/challenges",
  },
  {
    type: RouteType.REPORTED,
    pattern: /^\/(reported)\/?$/,
    canonicalPath: () => "/reported",
  },
  {
    type: RouteType.GAME_SUMMARY,
    pattern: /^\/game\/([^/]+)\/summary$/,
    paramKeys: ["matchId"],
  },
  {
    type: RouteType.GAME_ACTIVE,
    pattern: /^\/game\/([^/]+)$/,
    paramKeys: ["matchId"],
  },
  {
    type: RouteType.CHALLENGE_SUMMARY,
    pattern: /^\/play\/([^/]+)\/summary$/,
    paramKeys: ["token"],
  },
  {
    type: RouteType.CHALLENGE,
    pattern: /^\/play\/([^/]+)$/,
    paramKeys: ["token"],
  },
];

/**
 * Normalize pathname by stripping trailing slashes and defaulting to root.
 * @param {string} pathname
 * @returns {string}
 */
export function normalizePath(pathname) {
  if (!pathname) return "/";
  const [path, query] = pathname.split("?");
  const cleanPath = path.replace(/\/+$/, "") || "/";
  return query !== undefined ? `${cleanPath}?${query}` : cleanPath;
}

/**
 * Match a pathname against registered route patterns.
 * @param {string} pathname
 * @returns {{ type: string, params: Record<string, string>, query: Record<string, string>, path: string }}
 */
export function parseRoute(pathname) {
  const full = normalizePath(pathname);
  const [path, queryString] = full.split("?");
  const query = {};
  if (queryString) {
    const sp = new URLSearchParams(queryString);
    for (const [k, v] of sp.entries()) {
      query[k] = v;
    }
  }

  for (const def of ROUTE_DEFINITIONS) {
    const match = path.match(def.pattern);
    if (match) {
      const params = {};
      if (def.paramKeys) {
        def.paramKeys.forEach((key, index) => {
          const rawVal = match[index + 1];
          if (rawVal !== undefined) {
            params[key] = decodeURIComponent(rawVal);
          }
        });
      }
      return {
        type: def.type,
        params,
        query,
        path: def.canonicalPath ? def.canonicalPath(params) : path,
      };
    }
  }

  return { type: RouteType.UNKNOWN, params: {}, query, path };
}

/**
 * Register a global navigation guard before navigating away from a route.
 * @param {(toRoute: ReturnType<typeof parseRoute>, fromRoute: ReturnType<typeof parseRoute>) => boolean} guard
 */
export function setNavigationGuard(guard) {
  navigationGuardFn = guard;
}

/**
 * Return the current in-app navigation history depth index.
 * @returns {number}
 */
export function getAppHistoryIndex() {
  const currentBrowserState = (typeof window !== "undefined" && window.history && window.history.state) || {};
  return typeof currentBrowserState.appIndex === "number" ? currentBrowserState.appIndex : 0;
}

/**
 * Navigate to a given path using History API.
 * @param {string} path
 * @param {{ replace?: boolean, state?: any, force?: boolean, silent?: boolean }} [options]
 */
export async function navigate(path, { replace = false, state = null, force = false, silent = false } = {}) {
  const targetPath = normalizePath(path);
  const fromRoute = parseRoute(currentPath);
  const toRoute = parseRoute(targetPath);

  if (!force && navigationGuardFn && currentPath !== targetPath) {
    const guardRes = navigationGuardFn(toRoute, fromRoute);
    const allowed = guardRes && typeof guardRes.then === "function" ? await guardRes : guardRes;
    if (!allowed) {
      return false;
    }
  }

  const currentBrowserPath = window.location.pathname + window.location.search;
  const currentBrowserState = (window.history && window.history.state) || {};
  const currentAppIndex = typeof currentBrowserState.appIndex === "number" ? currentBrowserState.appIndex : 0;
  const baseCustomState = state && typeof state === "object" ? state : {};

  if (replace) {
    const nextState = { ...currentBrowserState, ...baseCustomState, appIndex: currentAppIndex };
    history.replaceState(nextState, "", targetPath);
  } else if (currentBrowserPath !== targetPath && window.location.pathname !== targetPath) {
    const nextState = { ...baseCustomState, appIndex: currentAppIndex + 1 };
    history.pushState(nextState, "", targetPath);
  }

  currentPath = targetPath;
  if (!silent) {
    dispatchRoute(toRoute);
  }
  return true;
}

let _isNavigatingBack = false;

/**
 * Navigate back to the previous page in this application session,
 * or safely navigate to a fallback route if opened directly without prior in-app history.
 * @param {string} [fallbackPath="/"] - Target route if no prior in-app history exists.
 * @returns {boolean} True if native history.back() was invoked, false if fallback navigation occurred.
 */
export function navigateBack(fallbackPath = "/") {
  if (_isNavigatingBack) return false;
  _isNavigatingBack = true;
  setTimeout(() => {
    _isNavigatingBack = false;
  }, 150);

  const currentBrowserState = (typeof window !== "undefined" && window.history && window.history.state) || {};
  const currentAppIndex = typeof currentBrowserState.appIndex === "number" ? currentBrowserState.appIndex : 0;

  if (currentAppIndex > 0) {
    window.history.back();
    return true;
  }
  navigate(fallbackPath, { replace: true });
  return false;
}

/**
 * Dispatch matched route to the registered handler.
 * @param {ReturnType<typeof parseRoute>} route
 */
function dispatchRoute(route) {
  if (typeof currentRouteHandler === "function") {
    currentRouteHandler(route);
  }
}

/**
 * Initialize the router, attach popstate listener, and dispatch initial route.
 * @param {(route: ReturnType<typeof parseRoute>) => void} handler
 */
export function initRouter(handler) {
  currentRouteHandler = handler;
  currentPath = normalizePath(window.location.pathname);

  // Initialize in-app navigation index on cold start if not already present
  if (typeof window !== "undefined" && window.history) {
    const currentBrowserState = window.history.state || {};
    if (typeof currentBrowserState.appIndex !== "number") {
      try {
        window.history.replaceState({ ...currentBrowserState, appIndex: 0 }, "", window.location.href);
      } catch (_) { }
    }
  }

  window.addEventListener("popstate", async (event) => {
    const newPath = normalizePath(window.location.pathname);
    const fromRoute = parseRoute(currentPath);
    const toRoute = parseRoute(newPath);

    if (navigationGuardFn && currentPath !== newPath) {
      // Revert current URL in browser history while awaiting dialog confirmation
      history.pushState(event.state, "", currentPath);

      const guardRes = navigationGuardFn(toRoute, fromRoute);
      const allowed = guardRes && typeof guardRes.then === "function" ? await guardRes : guardRes;
      if (!allowed) {
        return;
      }
      navigate(newPath, { force: true, replace: true });
      return;
    }

    currentPath = newPath;
    dispatchRoute(toRoute);
  });

  const initialRoute = parseRoute(currentPath);
  dispatchRoute(initialRoute);
}
