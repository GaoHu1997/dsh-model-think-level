/**
 * Plugin-wide constants shared by the host and browser halves.
 *
 * @module dsh-model-think-level/constants
 */

/** Stable plugin id, matching the cordis.patch.yml row and the bundle id. */
export const PLUGIN_ID = 'dsh-model-think-level'

/** Same-origin host route that proxies a provider's RAW /models listing. */
export const PROBE_PATH = '/dsh-model-think-level/raw-models'
/** Read-only diagnostics for the request-header takeover. */
export const DIAG_PATH = '/dsh-model-think-level/header-bridge'

/**
 * Same-origin host route that resolves one provider profile's stored
 * credential, so the API-key field's eye can show a SAVED key.
 *
 * The harness keeps provider keys write-only on purpose: the settings document
 * carries only the profile's `apiKeyEnv` reference, and the credential service
 * reports `{ configured, source, writable }` through `describe()` — never the
 * value. Only the host can read it (`credentials.resolve()`), and it does so
 * for the request adapters; the browser normally never sees a stored key at
 * all. This route is the plugin's deliberate exception: an explicit,
 * user-initiated, same-fence read that answers with the value and is never
 * cached, so the eye can put it back into the official field.
 */
export const PROVIDER_KEY_PATH = '/dsh-model-think-level/provider-key'

/**
 * Same-origin host route that owns a provider's list of API keys: their
 * references, their labels, and which one is in use.
 *
 * The harness has no notion of "several keys for one provider": a profile names
 * exactly one reference (`apiKeyEnv`) and a credential store holds exactly one
 * value per reference, with no enumeration and no label. Both facts are
 * deliberate — a configuration surface learns which references exist from its
 * settings schema — so a list of keys can only be plugin-owned state. It lives
 * in the harness home (`<DSH_HOME>/dsh-model-think-level/key-index.json`) rather
 * than in the pi-ai profile, so the official add-provider card, which writes the
 * WHOLE profile at `providers.<route>`, cannot drop it.
 *
 * The route both reads and writes: the values themselves still go to the
 * credential store through the host's own `credentials` service, so the browser
 * never needs a new Remote face.
 */
export const KEY_INDEX_PATH = '/dsh-model-think-level/key-index'

/**
 * Same-origin host route that reports this plugin's autofill switches. The
 * browser half runs the running auto-fill complement, and a `dsh.client`
 * declaration carries no plugin config, so the two switches have to be read
 * from the host that owns the cordis row; without it a deployment that turned
 * `autofill: false` would still be written to from the page.
 */
export const AUTOFILL_CONFIG_PATH = '/dsh-model-think-level/autofill-config'

/**
 * Same-origin host route reporting the request-header overlay (issue #12): the
 * routes whose `user-agent` the plugin is overriding, and what it found of the
 * plugins that rewrite the same surface. The browser half renders the
 * coexistence warning from here — the takeover lives host-side, so the page
 * cannot observe it on its own.
 */
export const HEADERS_CONFIG_PATH = '/dsh-model-think-level/headers-config'

/**
 * Same-origin host route owning model fingerprint attribution (ModelTrace).
 *
 * Three verbs on one path: `GET` returns the stored records for one provider
 * plus the bank summary the page needs to label families; `POST` runs one
 * model's three challenges and stores the verdict; `DELETE` forgets one model.
 * The attribution itself is `src/fingerprint/`, a pure port of ModelTrace's
 * `fingerprint-core.js` over a vendored bank -- so this route only does the
 * plumbing: run challenges through the llm service, parse, store.
 */
export const FINGERPRINT_PATH = '/dsh-model-think-level/fingerprint'

/** The settings namespace this plugin edits: pi-ai custom provider routes. */
export const PI_AI_NS = 'llm-pi-ai'

/**
 * Model-level marker written when the user deliberately unsets the
 * declaration ("back to inheritance"). Schemastery passes unknown model keys
 * through, so the marker survives official-page saves and restarts — which is
 * the point: auto-fill must respect the absence as a decision, not as a gap
 * to fill.
 */
export const UNSET_MARKER = 'reasoningEffortsUnset'

/**
 * Model-level marker for a deliberately unset input-modality declaration,
 * mirroring {@link UNSET_MARKER}: auto-fill must respect the absence of
 * `input` as a decision (the route default applies), not as a gap to fill.
 */
export const INPUT_UNSET_MARKER = 'inputUnset'

/**
 * Model-level marker declaring the row an IMAGE-GENERATION model (生图).
 *
 * The chat wire's own `input` vocabulary (pi-ai's MODALITY_GATE) only knows
 * text/image — the request modalities a model ACCEPTS — and an image generator
 * is not a request-modality answer at all: it is a different kind of model that
 * the composer's model switcher must hide (its entries cannot serve a chat
 * turn), so it lives beside the declaration as its own marker. Schemastery
 * passes unknown model keys through, so the marker survives official-page saves
 * and restarts like the other three; absence means "not an image generator",
 * and `false`/absent are the same state.
 */
export const INPUT_IMAGE_GEN_MARKER = 'inputImageGen'

/**
 * Model-level provenance marker written beside every ladder the HOST autofill
 * fills from the knowledge base, carrying the settings revision the fill read.
 *
 * It exists because the plugin's auto-fill and the user's staged declaration
 * race on the SAME row: whichever half runs the fill writes the knowledge base
 * suggestion, while the staged-declaration flush compares the document against
 * its own suggestion. By the time the flush looks, the suggestion may already
 * be stored -- and byte equality alone cannot tell "the plugin wrote this" from
 * "the user declared this", so a staged ladder differing from the knowledge
 * base in even one spelling (the editor's `off: null` against the knowledge
 * base's `off: 'none'`) was dropped as a document takeover: the reported
 * "configured it on the add-provider card, saved, and it is gone".
 *
 * With the marker the flush knows the stored ladder is a suggestion, so a
 * staged user intent overrides it. Either way the user's bytes win; the marker
 * only decides whether the flush is allowed to write at all. Schemastery passes
 * unknown model keys through, so the marker survives official-page saves and
 * restarts like the other two markers. Any ladder written through the plugin
 * clears it, which is what makes a later hand edit outrank a fresh staging.
 */
export const AUTOFILL_MARKER = 'reasoningEffortsAutofilled'

/**
 * Model-level default-effort pick (issue #4): the level a brand-new session
 * starts this model at, outranking the remembered levels. The value is one of
 * the model's own declared ladder keys, or the field is absent when the user
 * has not picked one (memory chain applies). Deliberately NOT a harness
 * concept: pi-ai's runtime never sees it (unknown model keys ride the settings
 * document the way the other markers do), and the browser half is its only
 * consumer. The name matches the catalog's `reasoning.defaultEffort` spelling
 * so a future first-class field can adopt the stored values as-is.
 */
export const DEFAULT_EFFORT_FIELD = 'defaultEffort'

/**
 * Same-origin host route owning the image-generation config surface: `GET`
 * answers the derived image-model list merged with the stored overrides,
 * `POST` saves default model / default params / output dir / per-model rows.
 * Backing file: `<DSH_HOME>/dsh-model-think-level/image.json` (see
 * {@link IMAGE_CONFIG_FILE}).
 */
export const IMAGE_CONFIG_PATH = '/dsh-model-think-level/image-config'

/**
 * Same-origin host route that runs one image generation through the shared
 * core (`src/image/generate.ts`): the explicit entry beside the wire dispatch
 * and the `/生图` host command — used for scripted calls and for callers that
 * want the `filePath` back.
 */
export const IMAGE_GENERATE_PATH = '/dsh-model-think-level/image-generate'

/**
 * Same-origin host route owning the image MCP server's install lifecycle:
 * `{action: "install"|"uninstall"|"status"|"selfcheck"}` over the marker block
 * in the current profile's `cordis.patch.yml`.
 */
export const IMAGE_MCP_PATH = '/dsh-model-think-level/image-mcp'

/** File name of the image-generation config inside the plugin's home dir. */
export const IMAGE_CONFIG_FILE = 'image.json'

/**
 * Fixed MCP `serverName` of the image server. Tool names derive as
 * `mcp__<serverName>__<rawName>`, so this string is part of the public surface:
 * `mcp__dsh-image__generate_image` must stay stable across HMR reloads.
 */
export const IMAGE_MCP_SERVER_NAME = 'dsh-image'

/** The patch-layer id the installed MCP entry carries (see src/image/mcp-install.ts). */
export const IMAGE_MCP_PATCH_ID = 'dsh-image-mcp'

/**
 * Marker-block name this plugin uses inside `cordis.patch.yml`. The begin/end
 * comment lines are `# >>> <name>:begin` / `# <<< <name>:end`; every write
 * splices exactly that byte range, so third-party marker blocks (the
 * dsh-skill-mcp-panel precedent) survive untouched.
 */
export const IMAGE_MCP_PATCH_MARK = 'dsh-model-think-level:image-mcp'

/** Locale dictionary namespace for the browser half's copy (not a settings namespace). */
export const STORE_NS = PLUGIN_ID
