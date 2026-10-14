import { defineConfig } from 'vitest/config';

// Unit + API end-to-end tests. Every test file gets its own throwaway database on a shared
// in-memory MongoDB replica set (see tests/setup), so files run in parallel and never touch
// the database configured in .env.
export default defineConfig({
    test: {
        environment: 'node',
        globalSetup: ['./tests/setup/globalSetup.js'],
        setupFiles: ['./tests/setup/testEnv.js'],
        include: ['tests/unit/**/*.test.js', 'tests/e2e/api/**/*.test.js'],
        pool: 'forks',
        testTimeout: 30000,
        hookTimeout: 120000,
        coverage: {
            provider: 'v8',
            include: ['src/**/*.js'],
            exclude: ['src/scripts/**', 'src/server.js', 'src/**/*.test.js'],
            reporter: ['text-summary', 'html'],
        },
    },
});
