"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
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
const grpc_js_1 = require("@grpc/grpc-js");
/*!
 * retryable status codes
 */
exports.RETRY_CODES = [
    grpc_js_1.status.OK,
    grpc_js_1.status.CANCELLED,
    grpc_js_1.status.UNKNOWN,
    grpc_js_1.status.DEADLINE_EXCEEDED,
    grpc_js_1.status.RESOURCE_EXHAUSTED,
    grpc_js_1.status.ABORTED,
    grpc_js_1.status.INTERNAL,
    grpc_js_1.status.UNAVAILABLE,
    grpc_js_1.status.DATA_LOSS,
];
/**
 * Used to track pull requests and determine if additional requests should be
 * made, etc.
 *
 * @class
 * @private
 */
class PullRetry {
    constructor() {
        this.failures = 0;
    }
    /**
     * Generates a timeout that can be used for applying a backoff based on the
     * current number of failed requests.
     *
     * @see {@link https://cloud.google.com/iot/docs/how-tos/exponential-backoff}
     * @private
     * @returns {number}
     */
    createTimeout() {
        if (this.failures === 0) {
            return 0;
        }
        return Math.pow(2, this.failures) * 1000 + Math.floor(Math.random() * 1000);
    }
    /**
     * Determines if a request status should be retried.
     *
     * Deadlines behave kind of unexpectedly on streams, rather than using it as
     * an indicator of when to give up trying to connect, it actually dictates
     * how long the stream should stay open. Because of this, it is virtually
     * impossible to determine whether or not a deadline error is the result of
     * the server closing the stream or if we timed out waiting for a connection.
     *
     * @private
     * @param {object} status The request status.
     * @returns {boolean}
     */
    retry(err) {
        if (err.code === grpc_js_1.status.OK || err.code === grpc_js_1.status.DEADLINE_EXCEEDED) {
            this.failures = 0;
        }
        else {
            this.failures += 1;
        }
        return exports.RETRY_CODES.includes(err.code);
    }
}
exports.PullRetry = PullRetry;
//# sourceMappingURL=pull-retry.js.map