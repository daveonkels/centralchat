# Grok and Gemini importer backlog

Research reviewed on **November 6, 2026**. Neither importer is implemented or
enabled. ChatGPT, Claude, and Raycast remain the supported sources.

## Decision and evidence

We searched public repositories for native export samples, their provenance, and
tests. We read source and fixtures without installing or running third-party code.
This is a bounded review, not a claim that suitable samples do not exist anywhere.

Community fixtures can be valuable, including sanitized snapshots based on real
exports. The missing evidence here is coverage: we did not find a documented pair
of native exports showing the same conversations before and after an update,
alongside enough conversation structure to check reconstruction. Passing tests
against a shape we invent would not validate compatibility with the provider.

| Provider | Evidence found | What remains unvalidated | Decision |
| --- | --- | --- | --- |
| Grok | An export-derived structural fixture with two messages, nested response records, extended-JSON dates, and reasoning; a separate four-message example | Multiple conversations, selected branches, attachment references, and stable identity/order across updated native exports | Hold; closer to a candidate parser, but insufficient evidence for release |
| Gemini | Takeout activity fixtures with several different prompt/reply shapes; Google AI Studio fixtures that are a separate format | Reliable conversation identifiers/grouping, actual reply coverage, HTML content, and identity across repeated Takeout exports | Hold; obtain representative Gemini Apps Takeout samples |

### Grok references

- [Official export instructions](https://x.ai/legal/faq) describe downloading data
  from Grok's Data Controls. That FAQ covers Grok.com and the mobile app; Grok on
  X is a separate source and is not assumed to share the same format.
- ThreadShelf's [fixture provenance](https://github.com/ChrystianSchutz/ThreadShelf/blob/f13b721561305c3b040dc701ce86553ec36c4447/test/fixtures/README.md)
  says its fixtures replace private content while preserving structures observed
  in real exports. Its [Grok fixture](https://github.com/ChrystianSchutz/ThreadShelf/blob/f13b721561305c3b040dc701ce86553ec36c4447/test/fixtures/grok-polish.json)
  has one conversation and two responses. Its
  [real-data checklist](https://github.com/ChrystianSchutz/ThreadShelf/blob/f13b721561305c3b040dc701ce86553ec36c4447/docs/REAL_DATA_TESTING.md)
  identifies `prod-grok-backend.json` as the native account export file.
- MyChatArchive's [four-message sample](https://github.com/1ch1n/mychatarchive/blob/9653c6ae535cff3422dc91ac58c6809c7d568d5d/examples/sample_grok.json)
  corroborates nested `conversation` / `responses[].response` records. It is an
  illustrative sample, not a documented before/after export pair.
- AIChatRetro's [Grok tests](https://github.com/systems1/aichatretro/blob/a654ef41a3bdad07ea4d61c3b9180d83e6bf983c/tests/test_grok.py)
  describe checks against a local corpus of 28 conversations and 500 messages.
  We inspected the test code, not that corpus; those assertions are not Central
  Chat validation results.

### Gemini references

- [Google's export instructions](https://support.google.com/gemini/answer/16920332?hl=en)
  distinguish **My Activity → Gemini Apps** (chats, generated media, uploads)
  from the **Gemini** product checkbox (Gems data).
- Gemini Chat Exporter's [Takeout fixture](https://github.com/davidmalko87/gemini-chat-exporter/blob/e895ef49a6a978e74d3d8e8e3226d3157bface62/tests/fixtures/takeout_myactivity.json)
  contains prompt-only and `subtitles` reply examples, plus unrelated Google
  activity. Its [documentation](https://github.com/davidmalko87/gemini-chat-exporter/blob/e895ef49a6a978e74d3d8e8e3226d3157bface62/README.md)
  notes that Takeout records can lack model responses.
- OpenMemory's [explicitly synthetic fixtures](https://github.com/Raethexn-Technologies/openmemory/blob/bfbc3af5fc0291702c037e9d7bb3659bc3b8b720/app/tests/Support/ConversationFixtures.php)
  use `subtitles` for prompts and `safeHtmlItem` for replies, with missing replies
  and missing conversation URLs among the cases. These are useful test ideas,
  but do not resolve native-export provenance and coverage on their own.
- Constellate's [Gemini fixture](https://github.com/JCarterJohnson/constellate/blob/31508ea5630b4404409b468fbab249126ab6c18f/Constellate-macOS/ConstellateKit/Tests/ConstellateCoreTests/Fixtures/fixture-gemini.json)
  has no conversation URLs. Time proximity alone is not sufficient evidence that
  two records belong to the same conversation.
- ThreadShelf labels its [Gemini fixtures](https://github.com/ChrystianSchutz/ThreadShelf/blob/f13b721561305c3b040dc701ce86553ec36c4447/test/fixtures/README.md)
  as **Google AI Studio**, not Gemini Apps Takeout. They cannot validate the
  requested Gemini account importer.

Links to repository evidence are pinned to the reviewed revisions. No third-party
fixture or implementation has been copied into Central Chat. Any future reuse
must retain the applicable license and attribution.

## Contributing a sample

1. [Open an issue](https://github.com/daveonkels/centralchat/issues/new?title=Export%20sample%20offer%3A%20Grok%20or%20Gemini)
   with the provider/product, export date, locale, export method, JSON or HTML
   format, and the cases you can test. A description is enough to start.
2. Prefer an export of deliberately fictional chats: at least two separate
   conversations, several follow-up turns, Unicode text, a code block, and a
   table. Use only harmless test attachments if including media. Record expected
   conversation/message counts and order from the provider's interface.
3. Export once, add a reply to an existing conversation, and export again. Keep
   both versions so we can check that a re-import adds the reply without creating
   duplicate conversations or messages. Edited/regenerated responses are useful
   additional cases; note the branch that was selected in the interface.
4. Before sharing, remove personal conversations, account details, emails, private
   URLs, credentials, and sensitive attachments. Replace identifiers consistently
   across both versions, preserving their relationships and data types. Preserve
   field names, nesting, timestamp formats, and relative file layout; document
   every structural change and omission. Inspect all files, including metadata.
5. Share only the reviewed minimal fixture through an issue or pull request, with
   a provenance note, expected results, and confirmation that you have the right
   to contribute it under this project's MIT license. Public GitHub content is
   public; do not upload a complete personal account archive.

For Gemini, select **My Activity → Gemini Apps** in Takeout and choose JSON for
activity records when available. Note whether replies and conversation links are
present. HTML exports are useful additional evidence, but are a separate parser
target. Browser-extension exports, API responses, and AI Studio downloads should
be labeled as such; they do not prove compatibility with native Takeout exports.

If sharing any sample is unsuitable, volunteer to run a future candidate importer
locally and report counts, ordering, and redacted failures instead.

## Implementation and release backlog

- [ ] **Collect fixtures and expected results.** Establish the native product and
  export path, inspect provenance/licensing, and cover multiple conversations and
  before/after exports. Sanitized real-export snapshots are acceptable; private
  conversation content is not required.
- [ ] **Grok candidate.** Detect native JSON by structure, normalize timestamps and
  roles, preserve stable IDs and message order, and define branch/reasoning
  handling. Validate attachment references or explicitly mark them unsupported.
- [ ] **Gemini candidate.** Identify Gemini activity among other Google records,
  reconstruct threads from verified identifiers, safely convert reply HTML, and
  report absent replies or ungroupable records rather than inventing answers or
  merging unrelated chats. Validate attachment references or mark them unsupported.
- [ ] **Import regressions.** Exercise nested folder detection, ZIP/JSON uploads,
  repeat imports, changed exports, malformed input, and unsupported variants.
  Check imported counts and content against the contributor's expected results.
- [ ] **App integration.** Add source labels/icons, filters, search operators,
  saved views, grouping, navigation, and statistics. Show **Experimental** and
  known limitations before import, with clear results for unsupported content.
- [ ] **Experimental release.** Publish the exact tested scope and evidence. A
  text-first importer can ship before media support when text reconstruction and
  repeat imports are validated and omissions are explicit.
- [ ] **Broader validation.** Collect independent export confirmations before
  removing the experimental label. No release date is committed.
