"use strict";
/*!
 * Copyright 2019 Google Inc. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const mocha_1 = require("mocha");
const grpc_js_1 = require("@grpc/grpc-js");
const publish_error_1 = require("../../src/publisher/publish-error");
mocha_1.describe('PublishError', () => {
    let error;
    const orderingKey = 'abcd';
    const fakeError = new Error('Oh noes');
    fakeError.code = 1;
    fakeError.details = 'Something went wrong!';
    fakeError.metadata = new grpc_js_1.Metadata();
    beforeEach(() => {
        error = new publish_error_1.PublishError(orderingKey, fakeError);
    });
    mocha_1.it('should give a helpful message', () => {
        assert.strictEqual(error.message, `Unable to publish for key "${orderingKey}". Reason: ${fakeError.message}`);
    });
    mocha_1.it('should capture the error code', () => {
        assert.strictEqual(error.code, fakeError.code);
    });
    mocha_1.it('should capture the error details', () => {
        assert.strictEqual(error.details, fakeError.details);
    });
    mocha_1.it('should capture the error metadata', () => {
        assert.strictEqual(error.metadata, fakeError.metadata);
    });
    mocha_1.it('should capture the ordering key', () => {
        assert.strictEqual(error.orderingKey, orderingKey);
    });
    mocha_1.it('should capture the original error', () => {
        assert.strictEqual(error.error, fakeError);
    });
});
//# sourceMappingURL=publish-error.js.map