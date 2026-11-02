const { app, BrowserWindow } = require('electron');
const fs = require('fs');

function createWindow() {
  const win = new BrowserWindow({
    width: 1280, height: 720, minWidth: 960, minHeight: 540,
    backgroundColor: '#000000', autoHideMenuBar: true, title: '幻之试炼',
    webPreferences: { contextIsolation: true, nodeIntegration: false, autoplayPolicy: 'no-user-gesture-required' },
  });
  win.setMenuBarVisibility(false);
  const q = {};
  for (const k of ['BOT', 'FAST', 'HERO', 'RUNS', 'AUTOSTART', 'RUN', 'DBG', 'LAYER', 'EV', 'GIVE', 'ROOM', 'ROBTEST', 'ROOM2', 'DEMO']) if (process.env[k]) q[k.toLowerCase()] = process.env[k];
  win.loadFile('index.html', { query: q });
  win.webContents.on('before-input-event', (_e, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') win.setFullScreen(!win.isFullScreen());
  });

  const shot = process.argv.find((a) => a.startsWith('--selftest='));
  if (shot) {
    const base = shot.split('=')[1].replace(/\.png$/, '');
    let done = false;
    const finish = () => { if (!done) { done = true; setTimeout(() => app.quit(), 300); } };
    win.webContents.on('console-message', (_e, level, msg) => {
      console.log(`[renderer:${level}] ${msg}`);
      if (msg.startsWith('[DONE]')) finish();
    });
    win.webContents.on('render-process-gone', (_e, d) => { console.log('[renderer gone]', d.reason); finish(); });
    const times = (process.env.SHOTS || '').split(',').filter(Boolean).map(Number);
    times.forEach((ms, i) => setTimeout(async () => {
      const img = await win.webContents.capturePage();
      fs.writeFileSync(`${base}_${i}.png`, img.toPNG());
      console.log('[selftest] saved', `${base}_${i}.png`);
    }, ms));
    setTimeout(finish, Number(process.env.SELFTEST_MS || 30000));
  }
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
