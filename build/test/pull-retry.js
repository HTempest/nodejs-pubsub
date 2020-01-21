"use strict";
// Copyright 2019 Google LLC
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
const sinon = require("sinon");
const grpc_js_1 = require("@grpc/grpc-js");
const pull_retry_1 = require("../src/pull-retry");
describe('PullRetry', () => {
    const sandbox = sinon.createSandbox();
    let retrier;
    beforeEach(() => {
        retrier = new pull_retry_1.PullRetry();
    });
    afterEach(() => {
        sandbox.restore();
    });
    describe('createTimeout', () => {
        it('should return 0 when no failures have occurred', () => {
            assert.strictEqual(retrier.createTimeout(), 0);
        });
        it('should use a backoff factoring in the failure count', () => {
            const random = Math.random();
            const expected = Math.pow(2, 1) * 1000 + Math.floor(random * 1000);
            sandbox.stub(global.Math, 'random').returns(random);
            retrier.retry({ code: grpc_js_1.status.CANCELLED });
            assert.strictEqual(retrier.createTimeout(), expected);
        });
    });
    describe('retry', () => {
        it('should return true for retryable errors', () => {
            [
                grpc_js_1.status.OK,
                grpc_js_1.status.CANCELLED,
                grpc_js_1.status.UNKNOWN,
                grpc_js_1.status.DEADLINE_EXCEEDED,
                grpc_js_1.status.RESOURCE_EXHAUSTED,
                grpc_js_1.status.ABORTED,
                grpc_js_1.status.INTERNAL,
                grpc_js_1.status.UNAVAILABLE,
                grpc_js_1.status.DATA_LOSS,
            ].forEach((code) => {
                const shouldRetry = retrier.retry({ code });
                assert.strictEqual(shouldRetry, true);
            });
        });
        it('should return false for non-retryable errors', () => {
            [
                grpc_js_1.status.INVALID_ARGUMENT,
                grpc_js_1.status.NOT_FOUND,
                grpc_js_1.status.PERMISSION_DENIED,
                grpc_js_1.status.FAILED_PRECONDITION,
                grpc_js_1.status.OUT_OF_RANGE,
                grpc_js_1.status.UNIMPLEMENTED,
            ].forEach((code) => {
                const shouldRetry = retrier.retry({ code });
                assert.strictEqual(shouldRetry, false);
            });
        });
        it('should reset the failure count on OK', () => {
            retrier.retry({ code: grpc_js_1.status.CANCELLED });
            retrier.retry({ code: grpc_js_1.status.OK });
            assert.strictEqual(retrier.createTimeout(), 0);
        });
        it('should reset the failure count on DEADLINE_EXCEEDED', () => {
            retrier.retry({ code: grpc_js_1.status.CANCELLED });
            retrier.retry({ code: grpc_js_1.status.DEADLINE_EXCEEDED });
            assert.strictEqual(retrier.createTimeout(), 0);
        });
    });
});
//# sourceMappingURL=pull-retry.js.map