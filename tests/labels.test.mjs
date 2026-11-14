import {test} from 'node:test';
import assert from 'node:assert/strict';
import {labelIndices} from '../src/labels.js';
test('15 visible days label every finite point; 16 show only extremes',()=>{const x=Array.from({length:20},(_,i)=>i);assert.equal(labelIndices(x,2,16).size,15);assert.deepEqual([...labelIndices(x,2,17)],[2,17]);});
test('extremes use the visible window, exclude null and resolve ties deterministically',()=>{const x=[999,...Array(16).fill(7),-999];x[5]=null;x[10]=2;assert.deepEqual([...labelIndices(x,1,16)],[10,1]);assert.deepEqual([...labelIndices(Array(20).fill(null),0,19)],[]);assert.deepEqual([...labelIndices(Array(20).fill(0),0,19)],[0]);});
