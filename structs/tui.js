const blessed = require('blessed');
const util = require('util');
const SHOW_STATUS_BAR = true;
const STATUS_BAR_HEIGHT = 2; 
const HIDDEN_PREFIXES = ['[official-shop-day]', '[set-bundle]'];
const REPAINT_EVERY_MS = 5000; 

const originalConsole = {};
for (const m of ['log', 'info', 'warn', 'error', 'debug']) originalConsole[m] = console[m].bind(console);
const originalStderrWrite = process.stderr.write.bind(process.stderr);

let screen;
let log;
let statusBar;
let pending = [];
let tornDown = false;
function hookConsole() {
    const colors = { warn: '\x1b[33m', error: '\x1b[31m' };
    for (const method of ['log', 'info', 'warn', 'error', 'debug']) {
        console[method] = (...args) => {
            const msg = util.format(...args);
            const trimmed = msg.trimStart();
            if (HIDDEN_PREFIXES.some(p => trimmed.startsWith(p)) || trimmed.trim() === '(none)') return;
            const color = colors[method];
            addLog(color ? `${color}${msg}\x1b[0m` : msg);
        };
    }
    process.stderr.write = (chunk, encoding, cb) => {
        const text = String(chunk).replace(/\r?\n$/, '');
        if (text) addLog(`\x1b[31m${text}\x1b[0m`);
        if (typeof encoding === 'function') encoding();
        else if (typeof cb === 'function') cb();
        return true;
    };
}

function restoreConsole() {
    for (const m of Object.keys(originalConsole)) console[m] = originalConsole[m];
    process.stderr.write = originalStderrWrite;
}
function teardown() {
    if (tornDown) return;
    tornDown = true;
    try { if (screen) screen.destroy(); } catch (e) {}
    restoreConsole();
    for (const line of pending) originalConsole.log(line);
    pending = [];
}

function quit(code) {
    teardown();
    process.exit(code);
}

function init() {
    screen = blessed.screen({
        smartCSR: true,
        title: 'Better better reload',
        fullUnicode: true,
        mouse: true
    });

    if (SHOW_STATUS_BAR) {
        statusBar = blessed.box({
            parent: screen,
            top: 0,
            left: 0,
            width: '100%',
            height: STATUS_BAR_HEIGHT,
            tags: true,
            content: 'Loading...'
        });
    }
    log = blessed.log({
        parent: screen,
        top: SHOW_STATUS_BAR ? STATUS_BAR_HEIGHT : 0,
        left: 0,
        width: '100%',
        height: SHOW_STATUS_BAR ? `100%-${STATUS_BAR_HEIGHT}` : '100%',
        tags: false,
        mouse: false,
        scrollable: true,
        alwaysScroll: true,
        scrollback: 5000
    });

    screen.program.hideCursor();
    for (const line of pending) log.log(line);
    pending = [];

    screen.key(['f1'], () => quit(0));
    screen.key(['escape', 'q', 'C-c'], () => quit(1));

    screen.key(['f5'], function () {
        log.setContent('');
        log.log('--- Logs Cleared ---');
        screen.realloc();
        screen.render();
    });

    screen.key(['w', 'W'], function () {
        log.scroll(-2);
        screen.render();
    });

    screen.key(['s', 'S'], function () {
        log.scroll(2);
        screen.render();
    });

    screen.on('resize', () => {
        screen.realloc();
        screen.render();
    });

    setInterval(() => {
        screen.realloc();
        screen.render();
    }, REPAINT_EVERY_MS).unref();

    screen.render();
}

function addLog(message) {
    if (log && log.log) {
        log.log(message);
        screen.render();
    } else {
        pending.push(message);
    }
}

function formatUptime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function updateStats(data) {
    if (!statusBar) return;

    const sep = ' {gray-fg}|{/gray-fg} ';
    const online = (v) => (v ? '{green-fg}ONLINE{/green-fg}' : '{red-fg}OFFLINE{/red-fg}');

    const stats = [
        `{bold}Port:{/bold} ${data.port || 'N/A'}`,
        `{bold}Website:{/bold} ${data.websitePort || 'N/A'}`,
        `{bold}MongoDB:{/bold} ${data.mongodb || 'Connecting...'}`,
        `{bold}XMPP:{/bold} ${online(data.xmpp)}`,
        `{bold}Bot:{/bold} ${online(data.bot)}`,
        `{bold}Players:{/bold} ${data.players || 0}`,
        `{bold}Uptime:{/bold} ${formatUptime(process.uptime())}`
    ].join(sep);

    const keys = '{gray-fg}F1: Restart | F5: Clear | W/S: Scroll | ESC/Q: Exit{/gray-fg}';

    statusBar.setContent(` ${stats}\n ${keys}`);
    screen.render();
}

hookConsole();
process.on('exit', teardown);
process.on('SIGINT', () => quit(130));
process.on('SIGTERM', () => quit(143));
process.on('uncaughtException', (err) => {
    teardown();
    console.error(err && err.stack ? err.stack : err);
    process.exit(1);
});

module.exports = {
    init,
    addLog,
    updateStats
};