import type { TrackingCallback } from "../types/growthbook";
import type { GrowthBook } from "../GrowthBook";
import type {
  GrowthBookClient,
  UserScopedGrowthBook,
} from "../GrowthBookClient";

export type Trackers = "gtag" | "gtm" | "segment";

export function thirdPartyTrackingPlugin({
  additionalCallback,
  trackers = ["gtag", "gtm", "segment"],
}: {
  additionalCallback?: TrackingCallback;
  trackers?: Trackers[];
} = {}) {
  // 仅浏览器环境
  if (typeof window === "undefined") {
    throw new Error("thirdPartyTrackingPlugin 仅限浏览器环境使用");
  }

  return (gb: GrowthBook | UserScopedGrowthBook | GrowthBookClient) => {
    gb.setTrackingCallback(async (e, r) => {
      const promises: Promise<unknown>[] = [];
      const eventParams = { experiment_id: e.key, variation_id: r.key };

      if (additionalCallback) {
        promises.push(Promise.resolve(additionalCallback(e, r)));
      }

      // GA4（Google Analytics 4）- gtag 跟踪
      if (trackers.includes("gtag") && window.gtag) {
        let gtagResolve;
        const gtagPromise = new Promise((resolve) => {
          gtagResolve = resolve;
        });
        promises.push(gtagPromise);
        window.gtag("event", "experiment_viewed", {
          ...eventParams,
          event_callback: gtagResolve,
        });
      }

      // GTM（Google Tag Manager）- dataLayer 跟踪
      if (trackers.includes("gtm") && window.dataLayer) {
        let datalayerResolve;
        const datalayerPromise = new Promise((resolve) => {
          datalayerResolve = resolve;
        });
        promises.push(datalayerPromise);
        window.dataLayer.push({
          event: "experiment_viewed",
          ...eventParams,
          eventCallback: datalayerResolve,
        });
      }

      // Segment（客户数据平台）- analytics.js 跟踪
      if (
        trackers.includes("segment") &&
        window.analytics &&
        window.analytics.track
      ) {
        window.analytics.track("Experiment Viewed", eventParams);
        const segmentPromise = new Promise((resolve) =>
          window.setTimeout(resolve, 300),
        );
        promises.push(segmentPromise);
      }

      await Promise.all(promises);
    });
  };
}
