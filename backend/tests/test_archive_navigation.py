"""Archive navigation and content-hint regressions; stdlib only."""
import sqlite3
import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.database import SCHEMA, conversation_neighbors, search, count_search_results, list_conversations, get_conversation, MATCH_ALL_QUERY
from app.content_attributes import text_attributes, media_attribute, matching_conversation_ids


class ContentTests(unittest.TestCase):
    def test_code_does_not_claim_example_images_or_tables(self):
        self.assertEqual(text_attributes('```md\n![example](photo.png)\nA | B\n--- | ---\n```'), {'code'})
        self.assertEqual(text_attributes('~~~python\nprint(1)\n~~~\n![photo](image.png)'), {'code', 'images'})

    def test_plain_prose_and_escaped_images_are_not_tags(self):
        self.assertEqual(text_attributes('Discuss code, images, and tables.\nUse `name` here.\n\\![not an image](file.png)'), set())
        self.assertEqual(text_attributes('A | B\n--- | --\n1 | 2'), set())

    def test_tables_and_reference_images(self):
        self.assertEqual(text_attributes('| A | B |\n| :--- | ---: |\n| 1 | 2 |\n![photo][image1]'), {'tables', 'images'})

    def test_media_types_and_generic_attachment_extensions(self):
        for kind, name, expected in [('image', 'opaque-id', 'images'), ('file', 'Photo.JPG', 'images'), ('audio/wav', 'opaque-id', 'audio'), ('file', 'clip.MP4', 'video'), ('application/pdf', 'notes.pdf', 'files')]:
            self.assertEqual(media_attribute(kind, name), expected)


class NavigationTests(unittest.TestCase):
    def setUp(self):
        self.conn = sqlite3.connect(':memory:')
        self.conn.row_factory = sqlite3.Row
        self.conn.executescript(SCHEMA)
        for i in range(65):
            cid = f'c{i:02}'
            date = f'2025-01-{i % 28 + 1:02}T12:00:00'
            self.conn.execute('INSERT INTO conversations (id,platform,title,created_at) VALUES (?,?,?,?)', (cid, 'openai' if i % 2 else 'claude', 'Coffee notes', date))
            for j in range(3):
                mid = f'{cid}-m{j}'
                content = 'coffee\n```python\nprint(1)\n```' if j == 2 else 'coffee recipe'
                self.conn.execute('INSERT INTO messages (id,conversation_id,role,content,created_at) VALUES (?,?,?,?,?)', (mid, cid, 'user' if j == 0 else 'assistant', content, date))
                self.conn.execute('INSERT INTO search_fts (content,title,conversation_id,message_id,entry_type) VALUES (?,?,?,?,?)', (content, 'Coffee notes', cid, mid, 'message'))
        self.conn.execute('INSERT INTO media_refs (message_id,media_type,original_path,filename) VALUES (?,?,?,?)', ('c00-m2', 'file', 'photo.png', 'photo.png'))

    def tearDown(self):
        self.conn.close()

    def test_browse_order_and_navigation_beyond_first_page(self):
        for sort in ('newest', 'oldest'):
            ordered = list_conversations(self.conn, limit=100, sort=sort)
            for i in (0, 49, 50, 64):
                result = conversation_neighbors(self.conn, ordered[i]['id'], sort=sort)
                self.assertEqual((result['position'], result['total']), (i + 1, 65))
                self.assertEqual(result['previous']['conversation_id'] if result['previous'] else None, ordered[i - 1]['id'] if i else None)
                self.assertEqual(result['next']['conversation_id'] if result['next'] else None, ordered[i + 1]['id'] if i < 64 else None)

    def test_search_order_matches_grouped_results_and_filters(self):
        for query in ('coffee', MATCH_ALL_QUERY):
            for sort in ('relevance', 'newest', 'oldest'):
                options = dict(platform='claude', role='assistant', before='2025-01-15T23:59:59', sort=sort)
                hits = search(self.conn, query, limit=200, **options)
                unique = {}
                for hit in hits:
                    unique.setdefault(hit['conversation_id'], hit['message_id'])
                ids = list(unique)
                result = conversation_neighbors(self.conn, ids[0], query=query, **options)
                self.assertEqual(result['total'], len(ids))
                self.assertEqual(result['next'], dict(conversation_id=ids[1], message_id=unique[ids[1]]))

    def test_outside_filter_and_missing_id_have_no_wrong_neighbors(self):
        for cid in ('c01', 'missing'):
            result = conversation_neighbors(self.conn, cid, platform='claude')
            self.assertIsNone(result['position'])
            self.assertIsNone(result['previous'])
            self.assertIsNone(result['next'])

    def test_badges_use_entire_conversation_not_only_search_hit(self):
        hit = search(self.conn, 'recipe', limit=200, sort='oldest')[0]
        self.assertEqual(hit['conversation_id'], 'c00')
        self.assertEqual(hit['attributes'], ['code', 'images'])
        self.assertEqual(get_conversation(self.conn, 'c00')['attributes'], ['code', 'images'])
        self.assertEqual(list_conversations(self.conn, sort='oldest')[0]['attributes'], ['code', 'images'])

    def test_attribute_filter_applies_before_pages_and_neighbors(self):
        ids = matching_conversation_ids(self.conn, 'code')
        pages = [row for offset in (0, 50) for row in list_conversations(self.conn, limit=50, offset=offset, attribute_ids=ids)]
        self.assertEqual(len(pages), 65)
        self.assertEqual(len({row['id'] for row in pages}), 65)
        result = conversation_neighbors(self.conn, pages[49]['id'], attribute_ids=ids)
        self.assertEqual(result['next']['conversation_id'], pages[50]['id'])
        self.assertEqual(result['total'], 65)

    def test_image_filter_matches_conversation_not_only_matching_message(self):
        ids = matching_conversation_ids(self.conn, 'images')
        self.assertEqual(ids, ['c00'])
        options = dict(role='user', attribute_ids=ids)
        hits = search(self.conn, 'recipe', **options)
        self.assertEqual([hit['message_id'] for hit in hits], ['c00-m0'])
        self.assertEqual(count_search_results(self.conn, 'recipe', **options), 1)
        self.assertEqual(count_search_results(self.conn, 'recipe', distinct_conversations=True, **options), 1)
        self.assertEqual(conversation_neighbors(self.conn, 'c00', query='recipe', **options)['total'], 1)

    def test_empty_attribute_filter_never_becomes_unfiltered(self):
        ids = matching_conversation_ids(self.conn, 'audio')
        self.assertEqual(ids, [])
        self.assertEqual(list_conversations(self.conn, attribute_ids=ids), [])
        self.assertEqual(search(self.conn, 'coffee', attribute_ids=ids), [])
        self.assertEqual(count_search_results(self.conn, 'coffee', attribute_ids=ids), 0)
        self.assertEqual(conversation_neighbors(self.conn, 'c00', attribute_ids=ids)['total'], 0)

    def test_attribute_and_platform_filters_intersect(self):
        ids = matching_conversation_ids(self.conn, 'images', platform='openai')
        self.assertEqual(ids, [])
        self.assertEqual(list_conversations(self.conn, platform='openai', attribute_ids=ids), [])

    def test_attribute_results_follow_new_and_removed_media(self):
        self.assertEqual(matching_conversation_ids(self.conn, 'audio'), [])
        self.conn.execute('INSERT INTO media_refs (message_id,media_type,original_path) VALUES (?,?,?)', ('c01-m0', 'audio/wav', 'recording.wav'))
        self.assertEqual(matching_conversation_ids(self.conn, 'audio'), ['c01'])
        self.conn.execute("DELETE FROM media_refs WHERE media_type='audio/wav'")
        self.assertEqual(matching_conversation_ids(self.conn, 'audio'), [])

    def test_invalid_attribute_is_not_silently_ignored(self):
        with self.assertRaises(ValueError):
            matching_conversation_ids(self.conn, 'typo')


if __name__ == '__main__':
    unittest.main()
