"""Search regressions using only SQLite and unittest (no package installation)."""
import sqlite3
import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.database import SCHEMA, search, count_search_results, list_conversations, MATCH_ALL_QUERY

class SearchPagingTests(unittest.TestCase):
    def setUp(self):
        self.conn = sqlite3.connect(':memory:')
        self.conn.row_factory = sqlite3.Row
        self.conn.executescript(SCHEMA)
        for i in range(3):
            cid = f'c{i}'
            date = f'2025-01-0{i+1}T12:00:00'
            self.conn.execute('INSERT INTO conversations (id,platform,title,created_at) VALUES (?,?,?,?)', (cid,'claude' if i == 2 else 'openai','Espresso notes',date))
            self.conn.execute('INSERT INTO search_fts (content,title,conversation_id,message_id,entry_type) VALUES (?,?,?,?,?)', ('Espresso notes','Espresso notes',cid,None,'title'))
            for j in range(60):
                mid = f'{cid}-m{j}'
                self.conn.execute('INSERT INTO messages (id,conversation_id,role,content,created_at,sequence) VALUES (?,?,?,?,?,?)',(mid,cid,'user' if j % 2 else 'assistant','espresso recipe',date,j))
                self.conn.execute('INSERT INTO search_fts (content,title,conversation_id,message_id,entry_type) VALUES (?,?,?,?,?)', ('espresso recipe','Espresso notes',cid,mid,'message'))
    def tearDown(self):
        self.conn.close()
    def test_total_is_not_page_length(self):
        self.assertEqual(len(search(self.conn,'espresso',limit=50)),50)
        self.assertEqual(search(self.conn,'espresso',limit=1)[0]['conversation_matches'],61)
        self.assertEqual(count_search_results(self.conn,'espresso'),183)
        self.assertEqual(count_search_results(self.conn,'espresso',distinct_conversations=True),3)
    def test_tied_ranks_have_stable_pages_and_message_targets(self):
        pages = [r for offset in range(0,200,50) for r in search(self.conn,'espresso',limit=50,offset=offset)]
        ids = [(r['conversation_id'],r['message_id']) for r in pages]
        self.assertEqual(len(ids),183)
        self.assertEqual(len(set(ids)),183)
        self.assertTrue(any(r['message_id'] == 'c0-m40' for r in pages))
    def test_filters_and_counts_agree(self):
        options = dict(platform='openai',role='user',before='2025-01-01T23:59:59')
        self.assertEqual(len(search(self.conn,'espresso',limit=200,**options)),30)
        self.assertEqual(count_search_results(self.conn,'espresso',**options),30)
        self.assertEqual(count_search_results(self.conn,'espresso',distinct_conversations=True,**options),1)
    def test_sort_applies_before_pagination(self):
        self.assertEqual(search(self.conn,'espresso',sort='newest',limit=1)[0]['conversation_id'],'c2')
        self.assertEqual(search(self.conn,'espresso',sort='oldest',limit=1)[0]['conversation_id'],'c0')
        self.assertEqual(search(self.conn,MATCH_ALL_QUERY,sort='oldest',limit=1)[0]['conversation_id'],'c0')
        self.assertEqual(list_conversations(self.conn,sort='oldest',limit=1)[0]['id'],'c0')
    def test_sort_cannot_inject_sql(self):
        self.assertTrue(search(self.conn,'espresso',sort='); DROP TABLE messages;'))
        self.assertEqual(self.conn.execute('SELECT COUNT(*) FROM messages').fetchone()[0],180)

if __name__ == '__main__': unittest.main()
