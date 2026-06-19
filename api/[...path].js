// Kept only so native catch-all routing (single-segment paths) still works.
// All real logic lives in ./router.js; multi-segment paths are routed there by vercel.json.
export { default, config } from "./router.js";
