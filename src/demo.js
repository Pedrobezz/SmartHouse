// Dispositivos simulados para testar o app sem contas configuradas
const AC_CAPS = {
  modes: ['COOL', 'AIR_DRY', 'FAN', 'AUTO', 'HEAT'],
  fans: ['LOW', 'MID', 'HIGH', 'POWER', 'AUTO'], turbo: true,
  tempMin: 16, tempMax: 30, tempStep: 1,
  eco: true, swingV: true, swingH: true, sleep: true, timer: true,
  display: ['ON', 'OFF'], airClean: [], windFlags: ['forestWind', 'autoFitWind'], raw: [],
};

const TV_KEYS = ['Power', 'Mute', 'VolumeUp', 'VolumeDown', 'ChannelUp', 'ChannelDown', 'Up', 'Down', 'Left', 'Right', 'OK', 'Back', 'Home', 'Menu', 'Input',
  '1', '2', '3', '4', '5', '6', '7', '8', '9', '0', 'Netflix', 'YouTube'].map((k, i) => ({ key: k, key_id: i, key_name: k, standard_key: true }));

function makeDemo() {
  const devices = [
    { id: 'demo-ac-quarto', provider: 'demo', type: 'ac', name: 'Ar do Quarto', online: true, caps: AC_CAPS,
      state: { on: true, mode: 'COOL', target: 23, current: 25.5, fan: 'AUTO', swingV: true, swingH: false, eco: false, sleepMin: 0, timerOffMin: 0, timerOnMin: 0, display: 'ON', humidity: 58, filter: 82, flags: { forestWind: false, autoFitWind: false } } },
    { id: 'demo-ac-sala', provider: 'demo', type: 'ac', name: 'Ar da Sala', online: true, caps: AC_CAPS,
      state: { on: false, mode: 'COOL', target: 24, current: 27, fan: 'MID', swingV: false, swingH: false, eco: true, sleepMin: 0, timerOffMin: 0, timerOnMin: 0, display: 'ON', humidity: 61, filter: 64, flags: { forestWind: false, autoFitWind: false } } },
    plug('demo-plug-tv', 'TV da Sala', true, 118),
    plug('demo-plug-abajur', 'Abajur', true, 9),
    plug('demo-plug-cafe', 'Cafeteira', false, 780),
    plug('demo-plug-pc', 'Mesa do Escritório', true, 165),
    plug('demo-plug-vent', 'Ventilador', false, 52),
    { id: 'demo-ir-tv', provider: 'demo', type: 'tv', name: 'TV do Quarto (IR)', online: true, model: 'Samsung · via Smart Controle Universal',
      caps: { ir: true, keys: TV_KEYS }, state: { on: false } },
    { id: 'demo-ir-ac', provider: 'demo', type: 'ac', name: 'Ar antigo (IR)', online: true, model: 'Springer · via Smart Controle Universal',
      caps: { ir: true, modes: ['COOL', 'HEAT', 'AUTO', 'FAN', 'AIR_DRY'], fans: ['AUTO', 'LOW', 'MID', 'HIGH'], tempMin: 16, tempMax: 30, tempStep: 1, eco: false, swingV: false, swingH: false, sleep: false, timer: false, display: [], airClean: [], windFlags: [], raw: [], turbo: false },
      state: { on: false, mode: 'COOL', target: 24, fan: 'AUTO', current: 26.4 } },
    { id: 'demo-switch-sala', provider: 'demo', type: 'switch', name: 'Interruptor Sala', online: true, model: 'Interruptor 3 teclas',
      caps: { channels: 3, relayStatus: ['power_off', 'power_on', 'last'], childLock: true },
      state: { on: true, channels: [{ code: 'switch_1', on: true, name: 'Luz principal' }, { code: 'switch_2', on: false, name: 'Spots' }, { code: 'switch_3', on: true, name: 'Pendente' }], relayStatus: 'last', childLock: false } },
  ];
  return devices;
}
function plug(id, name, on, watts) {
  return { id, provider: 'demo', type: 'plug', name, online: true, nominal: watts,
    caps: { metering: true, countdown: true, relayStatus: ['power_off', 'power_on', 'last'], childLock: true },
    state: { on, channels: [{ code: 'switch_1', on }], power: on ? watts : 0, voltage: 127.2, current: on ? watts / 127 : 0, energyKwh: Math.random() * 20, countdown: 0, relayStatus: 'last', childLock: false } };
}

function tickDemo(d, dtSec) {
  if (d.type === 'switch') return;
  if (d.type === 'plug') {
    const s = d.state;
    if (s.countdown > 0) { s.countdown = Math.max(0, s.countdown - dtSec); if (s.countdown === 0) { s.on = !s.on; s.channels[0].on = s.on; } }
    const noise = 1 + (Math.random() - 0.5) * 0.08;
    s.power = s.on ? +(d.nominal * noise).toFixed(1) : 0;
    s.voltage = +(126.5 + Math.random() * 1.5).toFixed(1);
    s.current = +(s.power / s.voltage).toFixed(3);
    s.energyKwh += s.power * dtSec / 3600000;
  } else if (d.type === 'ac') {
    const s = d.state;
    const goal = s.on && ['COOL', 'AUTO', 'HEAT', 'AIR_DRY'].includes(s.mode) ? s.target : 27.5;
    s.current = +(s.current + (goal - s.current) * 0.01 * dtSec / 5).toFixed(2);
    for (const k of ['sleepMin', 'timerOffMin']) if (s[k] > 0) {
      s[k] = Math.max(0, s[k] - dtSec / 60);
      if (s[k] === 0) s.on = false;
    }
    if (s.timerOnMin > 0) { s.timerOnMin = Math.max(0, s.timerOnMin - dtSec / 60); if (s.timerOnMin === 0) s.on = true; }
  }
}

function applyDemo(d, cmd) {
  const s = d.state;
  const v = cmd.value;
  switch (cmd.action) {
    case 'key': if (/^power/i.test(cmd.key)) s.on = !s.on; break;
    case 'power': s.on = !!v; if (s.channels) s.channels.forEach(c => (c.on = !!v)); break;
    case 'toggle': applyDemo(d, { action: 'power', value: !s.on }); break;
    case 'channel': s.channels.find(c => c.code === cmd.code).on = !!v; s.on = s.channels.some(c => c.on); break;
    case 'countdown': s.countdown = v; break;
    case 'relayStatus': s.relayStatus = v; break;
    case 'childLock': s.childLock = !!v; break;
    case 'mode': s.mode = v; break;
    case 'temp': s.target = v; break;
    case 'fan': s.fan = v; break;
    case 'swingV': s.swingV = !!v; break;
    case 'swingH': s.swingH = !!v; break;
    case 'eco': s.eco = !!v; break;
    case 'display': s.display = v; break;
    case 'windFlag': s.flags[cmd.key] = !!v; break;
    case 'sleep': s.sleepMin = v || 0; break;
    case 'timerOff': s.timerOffMin = v || 0; break;
    case 'timerOn': s.timerOnMin = v || 0; break;
    default: throw new Error('Comando desconhecido: ' + cmd.action);
  }
  if (d.type === 'plug') tickDemo(d, 0);
}

// Planta de exemplo (metros). Pode ser substituída no editor de planta.
const DEMO_LAYOUT = {
  rooms: [
    { id: 'r-sala', name: 'Sala', x: 0, y: 0, w: 6, h: 4.5 },
    { id: 'r-cozinha', name: 'Cozinha', x: 6, y: 0, w: 4, h: 4.5 },
    { id: 'r-quarto', name: 'Quarto', x: 0, y: 4.5, w: 4.5, h: 4 },
    { id: 'r-banheiro', name: 'Banheiro', x: 4.5, y: 4.5, w: 2, h: 4 },
    { id: 'r-escritorio', name: 'Escritório', x: 6.5, y: 4.5, w: 3.5, h: 4 },
  ],
  doors: [
    { dir: 'h', x: 2.75, y: 4.5, w: 0.8 },
    { dir: 'v', x: 6, y: 2.25, w: 1.8 },
    { dir: 'h', x: 5.5, y: 4.5, w: 0.7 },
    { dir: 'h', x: 7.6, y: 4.5, w: 0.8 },
    { dir: 'h', x: 1.6, y: 0, w: 1.0 },
  ],
};
const DEMO_PLACEMENTS = {
  'demo-ac-quarto': { x: 2.25, y: 8.38, rot: 0 },
  'demo-ac-sala': { x: 0.12, y: 2.2, rot: 0 },
  'demo-plug-tv': { x: 3, y: 0.4, rot: 0 },
  'demo-plug-abajur': { x: 3.8, y: 6.2, rot: 0 },
  'demo-plug-cafe': { x: 8.5, y: 0.5, rot: 0 },
  'demo-plug-pc': { x: 8.2, y: 7.6, rot: 0 },
  'demo-plug-vent': { x: 1.2, y: 5.2, rot: 0 },
  'demo-switch-sala': { x: 0.08, y: 3.4, rot: 0, wall: true, z: 1.2 },
  'demo-ir-tv': { x: 2.2, y: 4.35, rot: 0, wall: true, z: 1.0 },
  'demo-ir-ac': { x: 9.88, y: 2.2, rot: 0, wall: true, z: 2.2 },
};

module.exports = { makeDemo, tickDemo, applyDemo, DEMO_LAYOUT, DEMO_PLACEMENTS };
