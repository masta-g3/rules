import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { sum } from './sum.js';

test('adds positive numbers', () => assert.equal(sum(2, 3), 5));
