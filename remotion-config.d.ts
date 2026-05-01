/** Shim until Remotion publishes subpath types for `remotion/config`. */
declare module "remotion/config" {
  export const Config: {
    setKeyframeInterval(interval: number): void;
    setVideoImageFormat(format: "jpeg" | "png" | "none" | "webp"): void;
  };
}
