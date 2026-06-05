import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		environment: "node",
		include: ["packages/**/src/**/*.test.ts", "workers/**/src/**/*.test.ts"],
		coverage: {
			enabled: false,
		},
	},
});
