"""Synthetic browser integration; never connects to a YouTube account.
Run: python tests/browser_fixture.py (requires playwright + chromium).
"""
import functools,http.server,threading,unittest
from pathlib import Path
from playwright.sync_api import sync_playwright

class BrowserFixture(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        handler=functools.partial(http.server.SimpleHTTPRequestHandler,directory=str(Path(__file__).resolve().parents[1]))
        cls.server=http.server.ThreadingHTTPServer(('127.0.0.1',0),handler)
        threading.Thread(target=cls.server.serve_forever,daemon=True).start()
        cls.playwright=sync_playwright().start()
        cls.browser=cls.playwright.chromium.launch()
    @classmethod
    def tearDownClass(cls):
        cls.browser.close();cls.playwright.stop();cls.server.shutdown();cls.server.server_close()
    def test_selection_survives_rerender_desktop_and_mobile(self):
        for width in (1280,390):
            with self.subTest(width=width):
                page=self.browser.new_page(viewport={'width':width,'height':850})
                errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
                page.goto(f'http://127.0.0.1:{self.server.server_port}/tools/content-fixture.html')
                page.locator('#yt-multiselect-toggle').click()
                checks=page.locator('.yt-multiselect-checkbox')
                checks.first.check()
                self.assertTrue(checks.first.is_checked())
                page.locator('#rerender').click()
                page.wait_for_timeout(250)
                self.assertTrue(page.locator('.yt-multiselect-checkbox').first.is_checked())
                self.assertFalse(errors,errors)
                page.close()
if __name__=='__main__':unittest.main()
