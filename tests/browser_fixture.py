"""Browser integration with synthetic playlists; never connects to a YouTube account.
Run: python tests/browser_fixture.py (requires playwright + chromium).
"""
import functools, http.server, threading, unittest, tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright

class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args): pass

class BrowserFixture(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        handler = functools.partial(QuietHandler, directory=str(Path(__file__).resolve().parents[1]))
        cls.server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler)
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()
        cls.playwright = sync_playwright().start()
        cls.browser = cls.playwright.chromium.launch()
    @classmethod
    def tearDownClass(cls):
        cls.browser.close(); cls.playwright.stop(); cls.server.shutdown(); cls.server.server_close()
    def open_page(self, width=1280, theme='dark', scenario=''):
        page = self.browser.new_page(viewport={'width': width, 'height': 850})
        self.addCleanup(page.close)
        page.goto(f'http://127.0.0.1:{self.server.server_port}/tools/content-fixture.html?theme={theme}&scenario={scenario}')
        page.locator('#yt-multiselect-toggle').click()
        page.wait_for_function('document.querySelector("#yt-multiselect-tools").shadowRoot.querySelector(".count").textContent.includes("5")')
        return page
    def test_selection_rerender_and_native_layout_in_both_themes(self):
        for width in (1280, 390, 320, 280):
            for theme in ('light', 'dark'):
                with self.subTest(width=width, theme=theme):
                    page = self.open_page(width, theme)
                    errors = []; page.on('pageerror', lambda e: errors.append(str(e)))
                    checks = page.locator('.yt-multiselect-checkbox')
                    checks.first.check()
                    self.assertEqual(page.locator('[data-action=all]').get_attribute('aria-checked'), 'mixed')
                    page.locator('#rerender').click()
                    page.wait_for_function('document.querySelector(".yt-multiselect-checkbox")?.checked === true')
                    self.assertTrue(checks.first.is_checked())
                    bar = page.locator('.bar').bounding_box()
                    header = page.locator('ytd-masthead').bounding_box()
                    self.assertEqual(bar['width'], width)
                    self.assertAlmostEqual(bar['y'], header['y'] + header['height'], delta=1)
                    self.assertEqual(page.locator('#yt-multiselect-spacer').count(), 1)
                    for button in page.locator('.bar > button,.toolbar-actions button').all():
                        if button.is_visible():
                            bounds = button.bounding_box()
                            self.assertGreaterEqual(bounds['x'], 0)
                            self.assertLessEqual(bounds['x'] + bounds['width'], width)
                    page.locator('[data-action=save]').click()
                    self.assertTrue(page.get_by_placeholder('Find a playlist').is_visible())
                    panel = page.locator('.panel').bounding_box()
                    self.assertGreaterEqual(panel['x'], 0)
                    self.assertLessEqual(panel['x'] + panel['width'], width)
                    page.keyboard.press('Escape')
                    page.locator('[data-action=menu]').click()
                    menu = page.locator('.menu').bounding_box()
                    self.assertGreaterEqual(menu['x'], 0)
                    self.assertLessEqual(menu['x'] + menu['width'], width)
                    self.assertTrue(page.get_by_role('menuitem', name='Copy video links', exact=False).is_visible())
                    self.assertFalse(errors, errors)
                    page.close()
    def test_master_selection_shift_range_and_plain_links(self):
        page = self.open_page()
        checks = page.locator('.yt-multiselect-checkbox')
        checks.first.check()
        checks.nth(2).click(modifiers=['Shift'])
        self.assertEqual(checks.evaluate_all('(nodes) => nodes.filter(node => node.checked).length'), 3)
        page.locator('[data-action=links]').click()
        self.assertEqual(page.locator('#results').text_content(), '\n'.join(f'https://www.youtube.com/watch?v={id}' for id in ['abcdefghijk', 'lmnopqrstuv', '12345678901']))
        page.locator('[data-action=all]').click()
        self.assertEqual(page.locator('[data-action=all]').get_attribute('aria-checked'), 'true')
        page.locator('[data-action=all]').click()
        self.assertEqual(checks.evaluate_all('(nodes) => nodes.filter(node => node.checked).length'), 0)
        self.assertTrue(page.locator('[data-action=save]').is_disabled())
    def test_keyboard_menu_dialog_and_focus_restore(self):
        page = self.open_page(390)
        page.locator('.yt-multiselect-checkbox').first.check()
        page.locator('[data-action=menu]').click()
        page.keyboard.press('End')
        self.assertIn('Delete', page.evaluate('document.querySelector("#yt-multiselect-tools").shadowRoot.activeElement.textContent'))
        page.keyboard.press('Home')
        self.assertIn('Select all', page.evaluate('document.querySelector("#yt-multiselect-tools").shadowRoot.activeElement.textContent'))
        page.keyboard.press('Escape')
        self.assertEqual(page.evaluate('document.querySelector("#yt-multiselect-tools").shadowRoot.activeElement.dataset.action'), 'menu')
        page.locator('[data-action=menu]').click()
        page.get_by_role('menuitem', name='Saved operations', exact=False).click()
        self.assertTrue(page.get_by_role('dialog').is_visible())
        for _ in range(8):
            page.keyboard.press('Tab')
            self.assertTrue(page.evaluate('document.querySelector("#yt-multiselect-tools").shadowRoot.activeElement.closest(".dialog") !== null'))
        page.keyboard.press('Escape')
        self.assertEqual(page.evaluate('document.querySelector("#yt-multiselect-tools").shadowRoot.activeElement.dataset.action'), 'menu')
    def test_navigation_clears_occurrences_and_deactivation_restores_native_rows(self):
        page = self.open_page()
        page.locator('.yt-multiselect-checkbox').first.check()
        page.evaluate('history.pushState(null, "", "?list=PLdemo"); document.dispatchEvent(new Event("yt-navigate-finish"))')
        self.assertEqual(page.locator('.yt-multiselect-checkbox').evaluate_all('(nodes) => nodes.filter(node => node.checked).length'), 0)
        page.locator('[data-action=close]').click()
        self.assertEqual(page.locator('.yt-multiselect-checkbox').count(), 0)
        self.assertEqual(page.locator('#yt-multiselect-spacer').count(), 0)
        self.assertEqual(page.locator('ytd-playlist-video-renderer[draggable=true]').count(), 5)
    def test_sort_controls_execute_and_survive_reload(self):
        page = self.open_page()
        page.locator('[data-action=menu]').click()
        page.get_by_role('menuitem', name='Sort playlist', exact=False).click()
        self.assertEqual(page.locator('#sort-by').input_value(), 'title')
        with page.expect_navigation(): page.get_by_role('button', name='Sort', exact=True).click()
        self.assertEqual(page.locator('#video-title').first.text_content(), 'A calmer workflow')
    def test_late_copy_is_checked_without_replaying_adds(self):
        page = self.open_page(scenario='late-copy')
        page.locator('.yt-multiselect-checkbox').first.check()
        page.locator('[data-action=save]').click()
        page.get_by_role('button', name='Research notes', exact=True).click()
        page.wait_for_function('document.querySelector("#results").textContent.includes("No adds replayed")')
        self.assertIn('No adds replayed', page.locator('#results').text_content())
    def test_real_extension_loads_worker_and_styles_on_youtube_origin(self):
        root = str(Path(__file__).resolve().parents[1])
        with tempfile.TemporaryDirectory() as profile:
            context = self.playwright.chromium.launch_persistent_context(
                profile, channel='chromium', headless=True,
                args=[f'--disable-extensions-except={root}', f'--load-extension={root}'],
                ignore_default_args=['--disable-extensions'])
            try:
                if not context.service_workers: context.wait_for_event('serviceworker')
                self.assertTrue(context.service_workers[0].url.endswith('/src/background.js'))
                page = context.new_page()
                html = """<html dark><head><style>
                    body{margin:0;background:#0f0f0f;color:#fff}ytd-masthead{display:block;height:56px}
                    #end{display:flex}main{padding:20px}ytd-playlist-video-renderer{display:block;min-height:80px}
                    </style></head><body><ytd-masthead><div id="end"><div id="buttons"></div></div></ytd-masthead>
                    <main><ytd-playlist-video-renderer><a id="video-title" href="/watch?v=abcdefghijk&list=WL&index=1">Video</a></ytd-playlist-video-renderer></main></body></html>"""
                page.route('https://www.youtube.com/**', lambda route: route.fulfill(body=html, content_type='text/html'))
                page.goto('https://www.youtube.com/playlist?list=WL')
                page.locator('#yt-multiselect-toggle').click()
                page.wait_for_function('document.querySelector("#yt-multiselect-tools").shadowRoot.querySelector("link").sheet !== null')
                self.assertEqual(page.locator('.bar').bounding_box()['height'], 52)
                checkbox = page.locator('.yt-multiselect-checkbox').first
                self.assertEqual(checkbox.bounding_box()['width'], 44)
                checkbox.check()
                self.assertTrue(page.locator('[data-action=links]').is_enabled())
                self.assertTrue(page.locator('[data-action=save]').is_enabled())
                # There is no signed-in context in this synthetic page; edits fail closed.
                page.locator('[data-action=menu]').click()
                self.assertTrue(page.get_by_role('menuitem', name='Delete from playlist', exact=False).is_disabled())
            finally: context.close()
    def test_group_drag_and_native_drag_after_deactivation(self):
        page = self.open_page()
        page.locator('.yt-multiselect-checkbox').nth(0).check()
        page.locator('.yt-multiselect-checkbox').nth(2).check()
        with page.expect_navigation():
            page.evaluate("""() => {
                const rows = document.querySelectorAll('ytd-playlist-video-renderer'), transfer = new DataTransfer();
                rows[0].dispatchEvent(new DragEvent('dragstart', {bubbles:true,cancelable:true,dataTransfer:transfer}));
                const bounds = rows[4].getBoundingClientRect();
                rows[4].dispatchEvent(new DragEvent('dragover', {bubbles:true,cancelable:true,dataTransfer:transfer,clientY:bounds.bottom-2}));
                rows[4].dispatchEvent(new DragEvent('drop', {bubbles:true,cancelable:true,dataTransfer:transfer,clientY:bounds.bottom-2}));
            }""")
        self.assertEqual(page.locator('ytd-playlist-video-renderer').evaluate_all('(rows) => rows.map(row => row.dataset.occurrence)'), ['two', 'four', 'five', 'one', 'three'])
        page.locator('#yt-multiselect-toggle').click()
        page.locator('[data-action=close]').click()
        page.evaluate("""() => {
            const rows = document.querySelectorAll('ytd-playlist-video-renderer'), transfer = new DataTransfer();
            rows[0].dispatchEvent(new DragEvent('dragstart', {bubbles:true,cancelable:true,dataTransfer:transfer}));
            rows[4].dispatchEvent(new DragEvent('drop', {bubbles:true,cancelable:true,dataTransfer:transfer}));
        }""")
        self.assertEqual(page.locator('#results').text_content(), 'Native single-video move completed.')
    def test_checkpoints_update_inline_progress_without_status_round_trip(self):
        page = self.open_page()
        page.evaluate('''() => {
          const original = chrome.runtime.sendMessage;
          window.statusReads = 0;
          chrome.runtime.sendMessage = message => { if (message.type === 'STATUS') window.statusReads++; return original(message); };
          storageListeners.forEach(listener => listener({activeJob: {newValue: {phase: 'copying', items: fixtureItems, copied: ['one', 'two']}}}, 'local'));
        }''')
        self.assertEqual(page.evaluate('window.statusReads'), 0)
        self.assertEqual(page.locator('.progress').evaluate('node => node.style.getPropertyValue("--progress")'), '40%')

if __name__ == '__main__': unittest.main()
