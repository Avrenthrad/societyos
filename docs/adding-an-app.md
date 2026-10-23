# Adding a new app

1. Copy `apps/notes` to `apps/<name>` and rename it in `package.json`
   (`@societyos/<name>`) and `app.json`.
2. Add an accent for it in `packages/ui/src/tokens.ts` (`appAccents`).
3. Use the entity types from `@societyos/core`. Need a new shared type?
   Add it to `packages/core/src/entities.ts` with a test.
4. Read and write only through the `Store` from `@societyos/sync`.
5. Use `link()` whenever the app creates something from another app's data.
6. Add a `dev:<name>` script to the root `package.json`.
