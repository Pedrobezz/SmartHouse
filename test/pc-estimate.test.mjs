import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { estimatePcWatts: E, cpuTdpGuess, gpuTdpGuess } = require('../src/pcmon.js');

test('potência típica pelo nome das peças', () => {
  assert.equal(cpuTdpGuess('Intel(R) Core(TM) i5-12400F'), 65);
  assert.equal(cpuTdpGuess('Intel(R) Core(TM) i7-1255U'), 15);
  assert.equal(cpuTdpGuess('AMD Ryzen 7 5800X3D 8-Core Processor'), 105);
  assert.equal(gpuTdpGuess('NVIDIA GeForce RTX 3060'), 170);
  assert.equal(gpuTdpGuess('Intel(R) UHD Graphics 770'), 12);
  assert.ok(gpuTdpGuess('NVIDIA GeForce RTX 4060 Laptop GPU') < 115);
});
test('desktop parado gasta pouco; jogando gasta muito mais', () => {
  const p = { cpuTdp: 65, gpuTdp: 170, monitors: 1, monitorW: 25 };
  const idle = E({ ...p, cpuLoad: 0.03, gpuLoad: 0.02 }), game = E({ ...p, cpuLoad: 0.6, gpuLoad: 0.95 });
  assert.ok(idle.total > 60 && idle.total < 110, `parado ${idle.total}`);
  assert.ok(game.total > 250 && game.total < 400, `jogando ${game.total}`);
});
test('consumo real da placa NVIDIA e da bateria têm prioridade', () => {
  assert.equal(E({ cpuTdp: 65, gpuTdp: 170, gpuPowerReal: 40, cpuLoad: 0, monitors: 0 }).gpu, 40);
  const nb = E({ laptop: true, batteryW: 14.2, cpuTdp: 15, gpuTdp: 12, monitors: 0 });
  assert.equal(nb.total, 14); assert.ok(nb.real);
});
test('monitores em descanso quase não contam', () => {
  const on = E({ cpuTdp: 65, gpuTdp: 12, monitors: 2, monitorW: 25 }), off = E({ cpuTdp: 65, gpuTdp: 12, monitors: 2, monitorW: 25, monitorsOff: true });
  assert.equal(on.monitors, 50); assert.equal(off.monitors, 1);
});
