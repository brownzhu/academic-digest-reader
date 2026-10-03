# Contributing

Thanks for helping improve Academic Digest Reader.

## Before opening a change

- Keep parsing deterministic and local. Do not add remote parsing, analytics,
  tracking, or AI services without an explicit design discussion.
- Do not commit real inbox exports, private email, authentication data, or
  personal test fixtures.
- New newsletter support must use a dedicated parser behind the existing
  parser interface. Do not weaken NA Digest parsing with a generic fallback.
- Weak fields such as organization and location must stay `null` unless a
  rule has explicit textual evidence.

## Development workflow

```sh
npm ci
npm run check
npm test
npm run build
```

Parser changes should include:

1. a privacy-safe synthetic fixture;
2. an independently maintained golden manifest;
3. success and malformed-input tests;
4. evidence assertions for every newly populated field;
5. a short note explaining any new heuristic and its failure boundary.

Please keep pull requests focused and describe what was tested.
