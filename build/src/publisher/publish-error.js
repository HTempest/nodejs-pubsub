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
/**
 * Exception to be thrown during failed ordered publish.
 *
 * @class
 * @extends Error
 */
class PublishError extends Error {
    constructor(key, err) {
        super(`Unable to publish for key "${key}". Reason: ${err.message}`);
        /**
         * The gRPC status code.
         *
         * @name PublishError#code
         * @type {number}
         */
        this.code = err.code;
        /**
         * The gRPC status details.
         *
         * @name PublishError#details
         * @type {string}
         */
        this.details = err.details;
        /**
         * The gRPC metadata object.
         *
         * @name PublishError#metadata
         * @type {object}
         */
        this.metadata = err.metadata;
        /**
         * The ordering key this failure occurred for.
         *
         * @name PublishError#orderingKey
         * @type {string}
         */
        this.orderingKey = key;
        /**
         * The original gRPC error.
         *
         * @name PublishError#error
         * @type {Error}
         */
        this.error = err;
    }
}
exports.PublishError = PublishError;
//# sourceMappingURL=publish-error.js.map