import test from 'node:test';
import assert from 'node:assert/strict';
import {parseDevices,chooseExecution} from '../lib/devices.js';

const devices=parseDevices('Vulkan0\tIntel Graphics\nVulkan1\tNVIDIA RTX 5080\nCPU\tIntel CPU\n','ggml_vulkan: 0 = Intel Graphics | uma: 1 | fp16: 1\nggml_vulkan: 1 = NVIDIA RTX 5080 | uma: 0 | fp16: 1');
const portable={id:'portable',backend:'qwen-sdcpp',variant:'standard',tasks:['photograph','edit']};
const cuda={id:'cuda',backend:'qwen-diffusers',variant:'standard',tasks:['photograph','edit'],portableProfile:'portable'};
const settings={gpu:0,execution:'gpu',autoMaxPixels:262144};

test('Vulkan enumeration distinguishes integrated Intel and dedicated NVIDIA devices',()=>{
 assert.equal(devices[0].kind,'igpu');assert.equal(devices[1].vendor,'nvidia');assert.equal(devices[2].kind,'cpu');
});
test('CPU and iGPU select a portable equivalent; CUDA handoff preserves its own profile',()=>{
 for(const execution of ['cpu','igpu']){const r=chooseExecution({execution,width:256,height:256},settings,cuda,[cuda,portable],devices);assert.equal(r.profile.id,'portable');assert.equal(r.mode,execution);}
 assert.equal(chooseExecution({execution:'gpu'},settings,cuda,[cuda,portable],devices).profile.id,'cuda');
});
test('automatic size policy uses iGPU for small output and dedicated GPU for larger output',()=>{
 assert.equal(chooseExecution({execution:'auto',width:512,height:512},settings,portable,[portable],devices).mode,'igpu');
 assert.equal(chooseExecution({execution:'auto',width:1024,height:1024},settings,portable,[portable],devices).mode,'gpu');
 assert.equal(chooseExecution({execution:'auto',width:256,height:256},settings,portable,[portable],devices.filter(d=>d.kind!=='igpu')).mode,'cpu');
});
test('AMD Vulkan routes through portable weights without requiring a CUDA runtime',()=>{
 const amd=parseDevices('Vulkan0\tAMD Radeon RX 9070\nCPU\tRyzen CPU\n','ggml_vulkan: 0 = AMD Radeon RX 9070 | uma: 0 | fp16: 1');
 const r=chooseExecution({execution:'gpu'},settings,cuda,[cuda,portable],amd);assert.equal(r.profile.id,'portable');assert.equal(r.device.vendor,'amd');
});
test('unavailable iGPU and incompatible portable profiles fail instead of silently using another device',()=>{
 assert.throws(()=>chooseExecution({execution:'igpu'},settings,cuda,[cuda],devices),/portable/);
 assert.throws(()=>chooseExecution({execution:'igpu'},settings,portable,[portable],devices.filter(d=>d.kind!=='igpu')),/No integrated/);
});
test('multiple NVIDIA devices respect the configured resource index',()=>{
 const multi=[{name:'Vulkan0',vendor:'nvidia',kind:'gpu'},{name:'Vulkan1',vendor:'nvidia',kind:'gpu'}];
 assert.equal(chooseExecution({execution:'gpu'},{...settings,gpu:1},portable,[portable],multi).device.name,'Vulkan1');
 assert.throws(()=>chooseExecution({execution:'gpu'},{...settings,gpu:2},portable,[portable],multi),/No matching/);
});
