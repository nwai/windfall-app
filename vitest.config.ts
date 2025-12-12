import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['tests/**/*.test.ts'],
    exclude: [
      'App.test.tsx',
      'src/App.test.tsx',
      'src/components/ToastContainer.test.tsx',
      'parseCSVorJSON.test.ts',
      'src/parseCSVorJSON.test.ts',
      'src/lib/**/*.test.ts',
    ],
  },
});
