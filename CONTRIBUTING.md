# Contributing

Thanks for looking at Orbital. Bug fixes, new scenes, and small polish are all welcome.

## Run it

You need Node.js 22.

```bash
npm install && npm run dev
```

Open http://localhost:8080.

## Before a pull request

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

CI runs the install, lint, typecheck, and production build.

## Where things live

- Scenes and the gravity step are in `src/lib/orbit/sim.ts`.
- Drawing is in `src/lib/orbit/draw.ts`.
- The page and the dock are in `src/components/orbit/OrbitSim.tsx`.

Keep a pull request to one idea, and say how to see the change. Do not commit secrets or `.env` files.

## Issues

Use the bug, feature, or question template so the report has enough to act on.

## License

By contributing, you agree that your work is licensed under the MIT license in [LICENSE](LICENSE).
