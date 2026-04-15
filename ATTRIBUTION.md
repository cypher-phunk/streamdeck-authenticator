# Attribution

This plugin is a hard fork of [otp-streamdeck-plugin](https://github.com/gri-gus/otp-streamdeck-plugin)
by [Grigoriy Gusev (gri-gus)](https://github.com/gri-gus), licensed under the
[Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0).

## What changed from the original

The plugin has been substantially rewritten and is no longer compatible with the original:

- **Language**: Migrated from Python to TypeScript (Node.js)
- **SDK**: Upgraded from the V1 JavaScript Stream Deck SDK (embedded) to the official
  `@elgato/streamdeck` V2 TypeScript SDK
- **Packaging**: Now distributed as a `.streamDeckPlugin` bundle rather than a Python app
- **Button rendering**: Replaced `setTitle` with SVG-composed button images (`setImage`) for
  precise font, size, and layout control
- **Logo handling**: Added Logo.dev API integration for high-quality brand logos; logos are
  now persisted in per-button settings rather than fetched at runtime
- **UI**: Rewrote both Property Inspectors using the raw Stream Deck WebSocket API; added
  a "Load Logo" button, custom logo upload, and plugin-wide settings (Logo.dev API key, font)
- **Global settings**: Font family and Logo.dev API key are shared across all button instances

## License

Per Apache 2.0, the original copyright notice is reproduced below:

> Copyright 2023 Grigoriy Gusev
>
> Licensed under the Apache License, Version 2.0 (the "License");
> you may not use this file except in compliance with the License.
> You may obtain a copy of the License at
>
>     http://www.apache.org/licenses/LICENSE-2.0
>
> Unless required by applicable law or agreed to in writing, software
> distributed under the License is distributed on an "AS IS" BASIS,
> WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
> See the License for the specific language governing permissions and
> limitations under the License.
