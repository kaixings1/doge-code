import { defineConfig } from 'bun';

export default defineConfig({
  entry: './entrypoints/cli.tsx',
  target: 'bun',
  format: 'esm',
  sourcemap: true,
  minify: true,
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
    'process.env.VERSION': JSON.stringify('1.0.0'),
  },
  external: [
    '@anthropic-ai/sdk',
    'openai',
  ],
});