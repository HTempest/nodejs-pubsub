"use strict";
// Copyright 2017 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const mocha_1 = require("mocha");
const histogram_js_1 = require("../src/histogram.js");
mocha_1.describe('Histogram', () => {
    let histogram;
    const MIN_VALUE = 10000;
    const MAX_VALUE = 600000;
    beforeEach(() => {
        histogram = new histogram_js_1.Histogram({ min: MIN_VALUE, max: MAX_VALUE });
    });
    mocha_1.describe('initialization', () => {
        mocha_1.it('should set default min/max values', () => {
            histogram = new histogram_js_1.Histogram();
            assert.strictEqual(histogram.options.min, 0);
            assert.strictEqual(histogram.options.max, Number.MAX_SAFE_INTEGER);
        });
        mocha_1.it('should accept user defined min/max values', () => {
            histogram = new histogram_js_1.Histogram({ min: 5, max: 10 });
            assert.strictEqual(histogram.options.min, 5);
            assert.strictEqual(histogram.options.max, 10);
        });
        mocha_1.it('should create a data map', () => {
            assert(histogram.data instanceof Map);
        });
        mocha_1.it('should set the initial length to 0', () => {
            assert.strictEqual(histogram.length, 0);
        });
    });
    mocha_1.describe('add', () => {
        mocha_1.it('should increment a value', () => {
            histogram.data.set(MIN_VALUE, 1);
            histogram.add(MIN_VALUE);
            assert.strictEqual(histogram.data.get(MIN_VALUE), 2);
        });
        mocha_1.it('should initialize a value if absent', () => {
            histogram.add(MIN_VALUE);
            assert.strictEqual(histogram.data.get(MIN_VALUE), 1);
        });
        mocha_1.it('should adjust the length for each item added', () => {
            histogram.add(MIN_VALUE);
            histogram.add(MIN_VALUE);
            histogram.add(MIN_VALUE * 2);
            assert.strictEqual(histogram.length, 3);
        });
        mocha_1.it('should cap the value', () => {
            const outOfBounds = MAX_VALUE + MIN_VALUE;
            histogram.add(outOfBounds);
            assert.strictEqual(histogram.data.get(outOfBounds), undefined);
            assert.strictEqual(histogram.data.get(MAX_VALUE), 1);
        });
        mocha_1.it('should apply a minimum', () => {
            const outOfBounds = MIN_VALUE - 1000;
            histogram.add(outOfBounds);
            assert.strictEqual(histogram.data.get(outOfBounds), undefined);
            assert.strictEqual(histogram.data.get(MIN_VALUE), 1);
        });
    });
    mocha_1.describe('percentile', () => {
        function range(a, b) {
            const result = [];
            for (; a < b; a++) {
                result.push(a);
            }
            return result;
        }
        mocha_1.it('should return the nth percentile', () => {
            range(100, 201).forEach(value => {
                histogram.add(value * 1000);
            });
            assert.strictEqual(histogram.percentile(100), 200000);
            assert.strictEqual(histogram.percentile(101), 200000);
            assert.strictEqual(histogram.percentile(99), 199000);
            assert.strictEqual(histogram.percentile(1), 101000);
        });
        mocha_1.it('should return the min value if unable to determine', () => {
            assert.strictEqual(histogram.percentile(99), MIN_VALUE);
        });
    });
});
//# sourceMappingURL=histogram.js.map