import { unpluginRouterGeneratorFactory } from '@tanstack/router-plugin'

const plugin = unpluginRouterGeneratorFactory({
  routesDirectory: './src/routes',
  generatedRouteTree: './src/routeTree.gen.ts',
  autoCodeSplitting: true,
})

if (!plugin.vite?.configResolved) {
  throw new Error('TanStack Router generator plugin is unavailable')
}

await plugin.vite.configResolved({ root: process.cwd() })
