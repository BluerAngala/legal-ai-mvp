import { init } from "iii-sdk";
const sdk = init("ws://localhost:49134", { workerName: "test-trace" });
sdk.registerFunction({id: "test::trace", description: "tracer"}, async (input) => {
  console.error("===INPUT===");
  console.error(JSON.stringify(input, null, 2));
  console.error("===END===");
  return { echoed: input };
});
sdk.registerTrigger({type: "http", function_id: "test::trace", config: {api_path: "/test-trace", http_method: "POST"}});
setTimeout(() => process.exit(0), 10000);
