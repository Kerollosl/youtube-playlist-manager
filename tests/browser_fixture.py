"""Browser integration with synthetic playlists; never connects to a YouTube account.
Run: python tests/browser_fixture.py (requires playwright + chromium).
"""
import functools, http.server, threading, unittest, tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

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
    def test_selection_rerender_and_bottom_toolbar_in_both_themes(self):
        for width in (1280, 390, 320, 280):
            for theme in ('light', 'dark'):
                with self.subTest(width=width, theme=theme):
                    page = self.open_page(width, theme)
                    errors = []; page.on('pageerror', lambda e: errors.append(str(e)))
                    checks = page.locator('.yt-multiselect-checkbox')
                    checks.first.press('Space')
                    self.assertEqual(page.locator('[data-action=all]').get_attribute('aria-checked'), 'mixed')
                    page.locator('#rerender').click()
                    page.wait_for_function('document.querySelector(".yt-multiselect-checkbox")?.checked === true')
                    self.assertTrue(checks.first.is_checked())
                    bar = page.locator('.bar').bounding_box()
                    self.assertLessEqual(bar['width'], width - 16)
                    self.assertAlmostEqual(bar['x'] + bar['width'] / 2, width / 2, delta=1)
                    self.assertAlmostEqual(bar['y'] + bar['height'], 830, delta=1)
                    self.assertEqual(page.locator('#yt-multiselect-spacer').count(), 0)
                    self.assertEqual(checks.first.evaluate('node => getComputedStyle(node).clipPath'), 'inset(50%)')
                    self.assertNotEqual(page.locator('#index').first.evaluate('node => getComputedStyle(node).visibility'), 'hidden')
                    for button in page.locator('.bar > button,.toolbar-actions button').all():
                        if button.is_visible():
                            bounds = button.bounding_box()
                            self.assertGreaterEqual(bounds['x'], 0)
                            self.assertLessEqual(bounds['x'] + bounds['width'], width)
                    page.locator('[data-action=save]').click()
                    self.assertTrue(page.get_by_placeholder('Find a playlist').is_visible())
                    panel = page.locator('.panel').bounding_box()
                    self.assertLessEqual(panel['y'] + panel['height'], bar['y'])
                    self.assertGreaterEqual(panel['y'], 0)
                    self.assertGreaterEqual(panel['x'], 0)
                    self.assertLessEqual(panel['x'] + panel['width'], width)
                    page.keyboard.press('Escape')
                    page.locator('[data-action=menu]').click()
                    menu = page.locator('.menu').bounding_box()
                    self.assertLessEqual(menu['y'] + menu['height'], bar['y'])
                    self.assertGreaterEqual(menu['y'], 0)
                    self.assertGreaterEqual(menu['x'], 0)
                    self.assertLessEqual(menu['x'] + menu['width'], width)
                    self.assertTrue(page.get_by_role('menuitem', name='Copy selection', exact=False).is_visible())
                    for removed in ('Select all', 'Deselect all', 'Copy video links', 'Save to playlist', 'Saved operations', 'Performance'):
                        self.assertEqual(page.get_by_role('menuitem', name=removed, exact=False).count(), 0)
                    self.assertFalse(errors, errors)
                    page.close()
    def test_selected_duration_updates(self):
        page = self.open_page()
        checks = page.locator('.yt-multiselect-checkbox')
        self.assertTrue(page.locator('.duration').is_hidden())
        checks.nth(0).press('Space')
        expect(page.locator('.duration')).to_have_text('1:30')
        checks.nth(1).press('Space')
        expect(page.locator('.duration')).to_have_text('3:30')
        checks.nth(0).press('Space')
        expect(page.locator('.duration')).to_have_text('2:00')
        page.locator('[data-action=all]').click()
        expect(page.locator('.duration')).to_have_text('12:30')
        page.locator('[data-action=all]').click()
        self.assertTrue(page.locator('.duration').is_hidden())
        page.locator('[data-action=close]').click()
        page.evaluate('fixtureItems[0].durationSeconds = null')
        page.locator('#yt-multiselect-toggle').click()
        page.wait_for_function('document.querySelector("#yt-multiselect-tools").shadowRoot.querySelector(".count").textContent.includes("5")')
        checks.nth(0).press('Space')
        expect(page.locator('.duration')).to_have_text('Duration unknown')
        checks.nth(1).press('Space')
        expect(page.locator('.duration')).to_have_text('2:00 + unknown')
    def test_yt_summary_copies_single_or_multiple_selected_links(self):
        page = self.open_page()
        page.locator('[data-action=menu]').click()
        self.assertTrue(page.get_by_role('menuitem', name='YT Summary', exact=False).is_disabled())
        page.keyboard.press('Escape')
        for count in (1, 3):
            for index in range(count):
                page.locator('.yt-multiselect-checkbox').nth(index).press('Space')
            page.locator('[data-action=menu]').click()
            page.get_by_role('menuitem', name='YT Summary', exact=False).click()
            ids = ['abcdefghijk', 'lmnopqrstuv', '12345678901'][:count]
            expect(page.locator('#results')).to_have_text('/YT\n' + '\n'.join(f'https://www.youtube.com/watch?v={id}' for id in ids))
            expect(page.locator('.toast')).to_contain_text('⌥Space')
            self.assertEqual(page.locator('.yt-multiselect-checkbox:checked').count(), 0)
    def test_master_selection_shift_range_and_plain_links(self):
        page = self.open_page()
        checks = page.locator('.yt-multiselect-checkbox')
        checks.first.press('Space')
        page.locator('ytd-playlist-video-renderer').nth(2).click(modifiers=['Shift'])
        self.assertEqual(checks.evaluate_all('(nodes) => nodes.filter(node => node.checked).length'), 3)
        page.locator('[data-action=links]').click()
        self.assertEqual(page.locator('#results').text_content(), '\n'.join(f'https://www.youtube.com/watch?v={id}' for id in ['abcdefghijk', 'lmnopqrstuv', '12345678901']))
        self.assertEqual(page.locator('.yt-multiselect-checkbox:checked').count(), 0)
        page.locator('[data-action=all]').click()
        self.assertEqual(page.locator('[data-action=all]').get_attribute('aria-checked'), 'true')
        page.locator('[data-action=all]').click()
        self.assertEqual(checks.evaluate_all('(nodes) => nodes.filter(node => node.checked).length'), 0)
        self.assertTrue(page.locator('[data-action=save]').is_disabled())
    def test_card_click_tint_keyboard_focus_and_stable_menu(self):
        page = self.open_page()
        row = page.locator('ytd-playlist-video-renderer').first
        row.click()
        self.assertTrue(page.locator('.yt-multiselect-checkbox').first.is_checked())
        self.assertEqual(row.evaluate('node => getComputedStyle(node).backgroundColor'), 'rgba(62, 166, 255, 0.14)')
        page.locator('[data-action=menu]').click()
        page.evaluate('window.menuNode = document.querySelector("#yt-multiselect-tools").shadowRoot.querySelector(".menu button")')
        # An unrelated YouTube render must not replace a menu button mid-click.
        page.evaluate('document.querySelector(".summary").append(document.createElement("div"))')
        page.wait_for_timeout(250)
        self.assertTrue(page.evaluate('window.menuNode.isConnected'))
        page.get_by_role('menuitem', name='Copy selection', exact=False).click()
        expect(page.locator('.toast')).to_contain_text('ready to copy')
        self.assertFalse(page.locator('.yt-multiselect-checkbox').first.is_checked())
        page.locator('.yt-multiselect-checkbox').first.press('Space')
        self.assertEqual(row.evaluate('node => getComputedStyle(node).outlineStyle'), 'solid')
    def test_selection_before_unindexed_playlist_read_stays_selected(self):
        page = self.browser.new_page(viewport={'width': 1280, 'height': 850})
        self.addCleanup(page.close)
        page.goto(f'http://127.0.0.1:{self.server.server_port}/tools/content-fixture.html?scenario=delayed-unindexed')
        page.locator('#yt-multiselect-toggle').click()
        page.locator('ytd-playlist-video-renderer').first.click()
        page.evaluate('window.fixtureReadReady = true')
        page.locator('[data-action=menu]').click()
        page.get_by_role('menuitem', name='Cut selection', exact=False).wait_for()
        expect(page.get_by_role('menuitem', name='Cut selection', exact=False)).to_be_enabled()
        self.assertEqual(page.locator('.yt-multiselect-checkbox:checked').count(), 1)
        page.keyboard.press('Escape')
        page.locator('ytd-playlist-video-renderer').nth(2).click(modifiers=['Shift'])
        self.assertEqual(page.locator('.yt-multiselect-checkbox:checked').count(), 3)
    def test_reader_recovery_reenables_current_playlist_actions(self):
        page = self.open_page(scenario='reader-recovery')
        page.locator('ytd-playlist-video-renderer').first.click()
        page.locator('[data-action=menu]').click()
        self.assertTrue(page.get_by_role('menuitem', name='Cut selection', exact=False).is_disabled())
        page.keyboard.press('Escape')
        page.get_by_role('button', name='Details', exact=True).click()
        page.get_by_role('button', name='Check playlist reader', exact=True).click()
        page.get_by_text('Watch later: Complete', exact=False).wait_for()
        page.keyboard.press('Escape')
        page.locator('[data-action=menu]').click()
        for action in ('Cut selection', 'Move in this playlist', 'Delete from playlist'):
            self.assertTrue(page.get_by_role('menuitem', name=action, exact=False).is_enabled())
    def test_keyboard_menu_dialog_and_focus_restore(self):
        page = self.open_page(390)
        page.locator('.yt-multiselect-checkbox').first.press('Space')
        page.locator('[data-action=menu]').click()
        page.keyboard.press('End')
        self.assertIn('Delete', page.evaluate('document.querySelector("#yt-multiselect-tools").shadowRoot.activeElement.textContent'))
        page.keyboard.press('Home')
        self.assertIn('YT Summary', page.evaluate('document.querySelector("#yt-multiselect-tools").shadowRoot.activeElement.textContent'))
        page.keyboard.press('Escape')
        self.assertEqual(page.evaluate('document.querySelector("#yt-multiselect-tools").shadowRoot.activeElement.dataset.action'), 'menu')
        page.locator('[data-action=menu]').click()
        page.evaluate('() => { navigator.clipboard.writeText = async () => { throw new Error("Clipboard blocked"); }; }')
        page.get_by_role('menuitem', name='YT Summary', exact=False).click()
        expect(page.get_by_role('dialog')).to_be_visible()
        expect(page.get_by_role('textbox', name='YT Summary prompt')).to_have_value('/YT\nhttps://www.youtube.com/watch?v=abcdefghijk')
        self.assertEqual(page.locator('.yt-multiselect-checkbox:checked').count(), 1)
        for _ in range(8):
            page.keyboard.press('Tab')
            self.assertTrue(page.evaluate('document.querySelector("#yt-multiselect-tools").shadowRoot.activeElement.closest(".dialog") !== null'))
        page.keyboard.press('Escape')
        self.assertEqual(page.evaluate('document.querySelector("#yt-multiselect-tools").shadowRoot.activeElement.dataset.action'), 'menu')
    def test_reopening_selection_starts_empty_and_resets_shift_anchor(self):
        for exit_control in ('[data-action=close]', '#yt-multiselect-toggle'):
            with self.subTest(exit_control=exit_control):
                page = self.open_page()
                page.locator('ytd-playlist-video-renderer').first.click()
                page.locator(exit_control).click()
                page.locator('#yt-multiselect-toggle').click()
                expect(page.locator('.count')).to_contain_text('0 / 5 selected')
                self.assertEqual(page.locator('.yt-multiselect-checkbox:checked').count(), 0)
                self.assertEqual(page.locator('.yt-multiselect-chosen').count(), 0)
                self.assertTrue(page.locator('[data-action=save]').is_disabled())
                self.assertTrue(page.locator('[data-action=links]').is_disabled())
                page.locator('ytd-playlist-video-renderer').nth(2).click(modifiers=['Shift'])
                self.assertEqual(page.locator('.yt-multiselect-checkbox:checked').count(), 1)
                page.locator('[data-action=menu]').click()
                page.get_by_role('menuitem', name='Delete from playlist', exact=False).click()
                expect(page.get_by_role('button', name='Delete 1', exact=True)).to_be_visible()
                page.close()
    def test_navigation_clears_occurrences_and_deactivation_restores_native_rows(self):
        page = self.open_page()
        page.locator('.yt-multiselect-checkbox').first.press('Space')
        page.evaluate('history.pushState(null, "", "?list=PLdemo"); document.dispatchEvent(new Event("yt-navigate-finish"))')
        self.assertEqual(page.locator('.yt-multiselect-checkbox').evaluate_all('(nodes) => nodes.filter(node => node.checked).length'), 0)
        page.locator('[data-action=close]').click()
        self.assertEqual(page.locator('.yt-multiselect-checkbox').count(), 0)
        self.assertEqual(page.locator('#yt-multiselect-spacer').count(), 0)
        self.assertEqual(page.locator('ytd-playlist-video-renderer[draggable=true]').count(), 5)
    def test_canceled_and_failed_actions_keep_selection_for_retry(self):
        page = self.open_page()
        page.locator('ytd-playlist-video-renderer').first.click()
        page.locator('[data-action=menu]').click()
        page.get_by_role('menuitem', name='Delete from playlist', exact=False).click()
        page.keyboard.press('Escape')
        self.assertEqual(page.locator('.yt-multiselect-checkbox:checked').count(), 1)
        page.evaluate('''() => {
            const original = chrome.runtime.sendMessage;
            chrome.runtime.sendMessage = message => message.type === 'SORT'
                ? Promise.resolve({ok: false, error: 'Synthetic sort failure'}) : original(message);
        }''')
        page.locator('[data-action=menu]').click()
        page.get_by_role('menuitem', name='Sort selected videos', exact=False).click()
        page.get_by_role('button', name='Sort', exact=True).click()
        expect(page.locator('.toast')).to_contain_text('Couldn’t complete this step')
        self.assertEqual(page.locator('.yt-multiselect-checkbox:checked').count(), 1)
    def test_sort_updates_in_place_and_clears_selection(self):
        page = self.open_page()
        # A non-consecutive selection exercises the new selected-only sort path.
        page.locator('.yt-multiselect-checkbox').nth(1).press('Space')
        page.locator('.yt-multiselect-checkbox').nth(3).press('Space')
        page.evaluate('scrollTo(0, 100)')
        scroll = page.evaluate('scrollY')
        page.locator('[data-action=menu]').click()
        page.get_by_role('menuitem', name='Sort selected videos', exact=False).click()
        page.locator('#sort-by').select_option('title')
        page.locator('#sort-direction').select_option('ascending')
        page.evaluate('window.keptPage = true')
        page.get_by_role('button', name='Sort', exact=True).click()
        page.wait_for_function('document.querySelector("#video-title").textContent === "A calmer workflow"')
        self.assertTrue(page.evaluate('window.keptPage'))
        self.assertEqual(page.locator('#video-title').first.text_content(), 'A calmer workflow')
        self.assertEqual(page.locator('.yt-multiselect-checkbox:checked').count(), 0)
        self.assertEqual(page.locator('ytd-playlist-video-renderer').evaluate_all('(rows) => rows.map(row => row.querySelector("#video-title").textContent)'), ['A calmer workflow', 'Learning every day', 'Building useful tools', 'Making room for ideas', 'Small changes that help'])
        self.assertAlmostEqual(page.evaluate('scrollY'), scroll, delta=1)
    def test_late_copy_is_checked_without_replaying_adds(self):
        page = self.open_page(scenario='late-copy')
        page.locator('.yt-multiselect-checkbox').first.press('Space')
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
                self.assertEqual(page.locator('.bar').bounding_box()['height'], 56)
                checkbox = page.locator('.yt-multiselect-checkbox').first
                self.assertEqual(checkbox.bounding_box()['width'], 1)
                checkbox.press('Space')
                self.assertTrue(page.locator('[data-action=links]').is_enabled())
                self.assertTrue(page.locator('[data-action=save]').is_enabled())
                # There is no signed-in context in this synthetic page; edits fail closed.
                page.locator('[data-action=menu]').click()
                self.assertTrue(page.get_by_role('menuitem', name='Delete from playlist', exact=False).is_disabled())
            finally: context.close()
    def test_group_drag_and_native_drag_after_deactivation(self):
        page = self.open_page()
        page.locator('.yt-multiselect-checkbox').nth(0).press('Space')
        page.locator('.yt-multiselect-checkbox').nth(2).press('Space')
        page.evaluate('window.keptPage = true')
        page.evaluate("""() => {
                const rows = document.querySelectorAll('ytd-playlist-video-renderer'), transfer = new DataTransfer();
                rows[0].dispatchEvent(new DragEvent('dragstart', {bubbles:true,cancelable:true,dataTransfer:transfer}));
                const bounds = rows[4].getBoundingClientRect();
                rows[4].dispatchEvent(new DragEvent('dragover', {bubbles:true,cancelable:true,dataTransfer:transfer,clientY:bounds.bottom-2}));
                rows[4].dispatchEvent(new DragEvent('drop', {bubbles:true,cancelable:true,dataTransfer:transfer,clientY:bounds.bottom-2}));
            }""")
        page.wait_for_function('document.querySelector("ytd-playlist-video-renderer").dataset.occurrence === "two"')
        self.assertTrue(page.evaluate('window.keptPage'))
        self.assertEqual(page.locator('.yt-multiselect-checkbox:checked').count(), 0)
        self.assertEqual(page.locator('ytd-playlist-video-renderer').evaluate_all('(rows) => rows.map(row => row.dataset.occurrence)'), ['two', 'four', 'five', 'one', 'three'])
        page.locator('[data-action=close]').click()
        page.evaluate("""() => {
            const rows = document.querySelectorAll('ytd-playlist-video-renderer'), transfer = new DataTransfer();
            rows[0].dispatchEvent(new DragEvent('dragstart', {bubbles:true,cancelable:true,dataTransfer:transfer}));
            rows[4].dispatchEvent(new DragEvent('drop', {bubbles:true,cancelable:true,dataTransfer:transfer}));
        }""")
        self.assertEqual(page.locator('#results').text_content(), 'Native single-video move completed.')
    def test_refresh_fallback_keeps_page_and_disables_stale_editing(self):
        page = self.open_page(scenario='view-fallback')
        page.locator('.yt-multiselect-checkbox').first.press('Space')
        page.evaluate('window.keptPage = true')
        page.locator('[data-action=menu]').click()
        page.get_by_role('menuitem', name='Sort selected videos', exact=False).click()
        page.get_by_role('button', name='Sort', exact=True).click()
        page.get_by_role('button', name='Refresh', exact=True).wait_for()
        self.assertTrue(page.evaluate('window.keptPage'))
        self.assertEqual(page.locator('#video-title').first.text_content(), 'Building useful tools')
        page.locator('[data-action=menu]').click()
        self.assertTrue(page.get_by_role('menuitem', name='Delete from playlist', exact=False).is_disabled())
    def test_delete_updates_rows_without_reload(self):
        page = self.open_page()
        page.locator('.yt-multiselect-checkbox').first.press('Space')
        page.evaluate('window.keptPage = true')
        page.locator('[data-action=menu]').click()
        page.get_by_role('menuitem', name='Delete from playlist', exact=False).click()
        page.get_by_role('button', name='Delete 1', exact=True).click()
        page.wait_for_function('document.querySelectorAll("ytd-playlist-video-renderer").length === 4')
        self.assertTrue(page.evaluate('window.keptPage'))
        self.assertEqual(page.locator('.yt-multiselect-checkbox:checked').count(), 0)
    def test_stop_waits_for_batch_and_recovery_is_accessible_from_notice(self):
        page = self.open_page(320, scenario='stop')
        page.locator('.yt-multiselect-checkbox').first.press('Space')
        page.locator('[data-action=menu]').click()
        page.get_by_role('menuitem', name='Move in this playlist', exact=False).click()
        page.get_by_role('button', name='Move to bottom', exact=True).click()
        page.get_by_role('button', name='Stop after current batch', exact=True).click()
        page.wait_for_function('document.querySelector("#yt-multiselect-tools").shadowRoot.querySelector(".toast").textContent.includes("Stopped")')
        self.assertTrue(page.locator('[data-action=stop]').is_hidden())
        page.get_by_role('button', name='Review', exact=True).click()
        self.assertTrue(page.get_by_role('dialog').is_visible())
        self.assertTrue(page.get_by_role('button', name='Keep originals and close operation', exact=True).is_visible())
    def test_checkpoints_update_inline_progress_without_status_round_trip(self):
        page = self.open_page(scenario='stop')
        page.emulate_media(reduced_motion='reduce')
        page.locator('ytd-playlist-video-renderer').first.click()
        page.locator('[data-action=menu]').click()
        page.get_by_role('menuitem', name='Move in this playlist', exact=False).click()
        page.get_by_role('button', name='Move to bottom', exact=True).click()
        page.get_by_role('button', name='Stop after current batch', exact=True).wait_for()
        page.evaluate('''() => {
          const original = chrome.runtime.sendMessage;
          window.statusReads = 0;
          chrome.runtime.sendMessage = message => { if (message.type === 'STATUS') window.statusReads++; return original(message); };
          storageListeners.forEach(listener => listener({activeJob: {newValue: {...fixtureStorage.activeJob, phase: 'copying', itemCount: fixtureItems.length, items: fixtureItems, copied: ['one', 'two']}}}, 'local'));
        }''')
        self.assertEqual(page.evaluate('window.statusReads'), 0)
        self.assertAlmostEqual(page.locator('.progress span').evaluate('node => node.getBoundingClientRect().width / node.parentElement.getBoundingClientRect().width'), 0.4, delta=0.001)
        page.get_by_role('button', name='Stop after current batch', exact=True).click()

if __name__ == '__main__': unittest.main()
