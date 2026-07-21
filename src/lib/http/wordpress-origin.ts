import { lookup } from "node:dns";
import { isIP, type LookupFunction } from "node:net";

import { Agent } from "undici";

import { getServerEnv } from "@/lib/env";
import type { FetchRequestInit } from "@/lib/http/fetch-policy";

type CachedDispatcher = {
  hostname: string;
  originIp: string;
  dispatcher: Agent;
};

let cachedDispatcher: CachedDispatcher | null = null;

function getWordPressOriginDispatcher(hostname: string, originIp: string) {
  if (
    cachedDispatcher &&
    cachedDispatcher.hostname === hostname &&
    cachedDispatcher.originIp === originIp
  ) {
    return cachedDispatcher.dispatcher;
  }

  const family = isIP(originIp);
  const routeWordPressHostname: LookupFunction = (requestedHostname, options, callback) => {
    if (requestedHostname !== hostname) {
      lookup(requestedHostname, options, callback);
      return;
    }

    if (options.all) {
      callback(null, [{ address: originIp, family }]);
      return;
    }

    callback(null, originIp, family);
  };

  const dispatcher = new Agent({
    connect: {
      lookup: routeWordPressHostname,
    },
  });

  cachedDispatcher = { hostname, originIp, dispatcher };
  return dispatcher;
}

/**
 * Routes only Foundry's authenticated WordPress traffic to a configured origin IP while
 * retaining the public hostname for TLS and HTTP Host validation. This is useful when a
 * public proxy challenges automation but the HTTPS origin is directly reachable.
 */
export function withWordPressOriginTransport(
  url: string,
  init: FetchRequestInit,
): FetchRequestInit {
  const env = getServerEnv();
  const originIp = env.WORDPRESS_ORIGIN_IP;

  if (!originIp) {
    return init;
  }

  const wordPressHostname = new URL(env.WORDPRESS_URL).hostname;
  const requestedHostname = new URL(url).hostname;

  if (requestedHostname !== wordPressHostname) {
    return init;
  }

  return {
    ...init,
    dispatcher: getWordPressOriginDispatcher(wordPressHostname, originIp),
  };
}
