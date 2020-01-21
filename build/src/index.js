"use strict";
/*!
 * Copyright 2014 Google Inc. All Rights Reserved.
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
 * @namespace google.pubsub.v1
 */
/**
 * @namespace google.protobuf
 */
/**
 * The default export of the `@google-cloud/pubsub` package is the
 * {@link PubSub} class.
 *
 * See {@link PubSub} and {@link ClientConfig} for client methods and
 * configuration options.
 *
 * @module {PubSub} @google-cloud/pubsub
 * @alias nodejs-pubsub
 *
 * @example <caption>Install the client library with <a href="https://www.npmjs.com/">npm</a>:</caption>
 * npm install @google-cloud/pubsub
 *
 * @example <caption>Import the client library</caption>
 * const {PubSub} = require('@google-cloud/pubsub');
 *
 * @example <caption>Create a client that uses <a href="https://cloud.google.com/docs/authentication/production#providing_credentials_to_your_application">Application Default Credentials (ADC)</a>:</caption>
 * const pubsub = new PubSub();
 *
 * @example <caption>Create a client with <a href="https://cloud.google.com/docs/authentication/production#obtaining_and_providing_service_account_credentials_manually">explicit credentials</a>:</caption>
 * const pubsub = new PubSub({
 *   projectId: 'your-project-id',
 *   keyFilename: '/path/to/keyfile.json'
 * });
 *
 * @example <caption>include:samples/quickstart.js</caption>
 * region_tag:pubsub_quickstart_create_topic
 * Full quickstart example:
 */
/**
 * Reference to internal generated clients, advanced use only.
 *
 * @name PubSub.v1
 * @see v1.PublisherClient
 * @see v1.SubscriberClient
 * @type {object}
 * @property {constructor} PublisherClient
 *     Reference to {@link v1.PublisherClient}.
 * @property {constructor} SubscriberClient
 *     Reference to {@link v1.SubscriberClient}.
 */
/**
 * Reference to internal generated clients, advanced use only.
 *
 * @name module:@google-cloud/pubsub.v1
 * @see v1.PublisherClient
 * @see v1.SubscriberClient
 * @type {object}
 * @property {constructor} PublisherClient
 *     Reference to {@link v1.PublisherClient}.
 * @property {constructor} SubscriberClient
 *     Reference to {@link v1.SubscriberClient}.
 */
const v1 = require('./v1');
exports.v1 = v1;
var iam_1 = require("./iam");
exports.IAM = iam_1.IAM;
var pubsub_1 = require("./pubsub");
exports.PubSub = pubsub_1.PubSub;
var snapshot_1 = require("./snapshot");
exports.Snapshot = snapshot_1.Snapshot;
var subscriber_1 = require("./subscriber");
exports.Message = subscriber_1.Message;
var subscription_1 = require("./subscription");
exports.Subscription = subscription_1.Subscription;
var topic_1 = require("./topic");
exports.Topic = topic_1.Topic;
if (process.env.DEBUG_GRPC) {
    console.info('gRPC logging set to verbose');
    const { setLogger, setLogVerbosity, logVerbosity } = require('@grpc/grpc-js');
    setLogger(console);
    setLogVerbosity(logVerbosity.DEBUG);
}
//# sourceMappingURL=index.js.map