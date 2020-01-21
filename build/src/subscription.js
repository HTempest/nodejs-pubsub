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
const promisify_1 = require("@google-cloud/promisify");
const events_1 = require("events");
const extend = require("extend");
const snakeCase = require("lodash.snakecase");
const iam_1 = require("./iam");
const snapshot_1 = require("./snapshot");
const subscriber_1 = require("./subscriber");
/**
 * @typedef {object} ExpirationPolicy
 * A policy that specifies the conditions for this subscription's expiration. A
 * subscription is considered active as long as any connected subscriber is
 * successfully consuming messages from the subscription or is issuing
 * operations on the subscription. If expirationPolicy is not set, a default
 * policy with ttl of 31 days will be used. The minimum allowed value for
 * expirationPolicy.ttl is 1 day.
 * @property {google.protobuf.Duration} ttl Specifies the "time-to-live"
 *     duration for an associated resource. The resource expires if it is not
 *     active for a period of `ttl`. The definition of "activity" depends on the
 *     type of the associated resource. The minimum and maximum allowed values
 *     for `ttl` depend on the type of the associated resource, as well. If
 *     `ttl` is not set, the associated resource never expires.
 */
/**
 * A Subscription object will give you access to your Cloud Pub/Sub
 * subscription.
 *
 * Subscriptions are sometimes retrieved when using various methods:
 *
 * - {@link PubSub#getSubscriptions}
 * - {@link Topic#getSubscriptions}
 *
 * Subscription objects may be created directly with:
 *
 * - {@link PubSub#createSubscription}
 * - {@link Topic#createSubscription}
 *
 * All Subscription objects are instances of an
 * [EventEmitter](http://nodejs.org/api/events.html). The subscription will pull
 * for messages automatically as long as there is at least one listener assigned
 * for the `message` event.
 *
 * By default Subscription objects allow you to process 100 messages at the same
 * time. You can fine tune this value by adjusting the
 * `options.flowControl.maxMessages` option.
 *
 * If your subscription is seeing more re-deliveries than preferable, you might
 * try increasing your `options.ackDeadline` value or decreasing the
 * `options.streamingOptions.maxStreams` value.
 *
 * Subscription objects handle ack management, by automatically extending the
 * ack deadline while the message is being processed, to then issue the ack or
 * nack of such message when the processing is done. **Note:** message
 * redelivery is still possible.
 *
 * By default each {@link PubSub} instance can handle 100 open streams, with
 * default options this translates to less than 20 Subscriptions per PubSub
 * instance. If you wish to create more Subscriptions than that, you can either
 * create multiple PubSub instances or lower the
 * `options.streamingOptions.maxStreams` value on each Subscription object.
 *
 * @class
 *
 * @param {PubSub} pubsub PubSub object.
 * @param {string} name The name of the subscription.
 * @param {SubscriberOptions} [options] Options for handling messages.
 *
 * @example <caption>From {@link PubSub#getSubscriptions}</caption>
 * const {PubSub} = require('@google-cloud/pubsub');
 * const pubsub = new PubSub();
 *
 * pubsub.getSubscriptions((err, subscriptions) => {
 *   // `subscriptions` is an array of Subscription objects.
 * });
 *
 * @example <caption>From {@link Topic#getSubscriptions}</caption>
 * const topic = pubsub.topic('my-topic');
 * topic.getSubscriptions((err, subscriptions) => {
 *   // `subscriptions` is an array of Subscription objects.
 * });
 *
 * @example <caption>{@link Topic#createSubscription}</caption>
 * const topic = pubsub.topic('my-topic');
 * topic.createSubscription('new-subscription', (err, subscription) => {
 *   // `subscription` is a Subscription object.
 * });
 *
 * @example <caption>{@link Topic#subscription}</caption>
 * const topic = pubsub.topic('my-topic');
 * const subscription = topic.subscription('my-subscription');
 * // `subscription` is a Subscription object.
 *
 * @example <caption>Once you have obtained a subscription object, you may begin
 * to register listeners. This will automatically trigger pulling for messages.
 * </caption>
 * // Register an error handler.
 * subscription.on('error', (err) => {});
 *
 * // Register a close handler in case the subscriber closes unexpectedly
 * subscription.on('close', () => {});
 *
 * // Register a listener for `message` events.
 * function onMessage(message) {
 *   // Called every time a message is received.
 *
 *   // message.id = ID of the message.
 *   // message.ackId = ID used to acknowledge the message receival.
 *   // message.data = Contents of the message.
 *   // message.attributes = Attributes of the message.
 *   // message.publishTime = Date when Pub/Sub received the message.
 *
 *   // Ack the message:
 *   // message.ack();
 *
 *   // This doesn't ack the message, but allows more messages to be retrieved
 *   // if your limit was hit or if you don't want to ack the message.
 *   // message.nack();
 * }
 * subscription.on('message', onMessage);
 *
 * // Remove the listener from receiving `message` events.
 * subscription.removeListener('message', onMessage);
 *
 * @example <caption>To apply a fine level of flow control, consider the
 * following configuration</caption>
 * const subscription = topic.subscription('my-sub', {
 *   flowControl: {
 *     maxMessages: 1,
 *     // this tells the client to manage and lock any excess messages
 *     allowExcessMessages: false
 *   }
 * });
 */
class Subscription extends events_1.EventEmitter {
    constructor(pubsub, name, options) {
        super();
        options = options || {};
        this.pubsub = pubsub;
        this.request = pubsub.request.bind(pubsub);
        this.name = Subscription.formatName_(this.projectId, name);
        this.topic = options.topic;
        /**
         * [IAM (Identity and Access
         * Management)](https://cloud.google.com/pubsub/access_control) allows you
         * to set permissions on individual resources and offers a wider range of
         * roles: editor, owner, publisher, subscriber, and viewer. This gives you
         * greater flexibility and allows you to set more fine-grained access
         * control.
         *
         * *The IAM access control features described in this document are Beta,
         * including the API methods to get and set IAM policies, and to test IAM
         * permissions. Cloud Pub/Sub's use of IAM features is not covered by
         * any SLA or deprecation policy, and may be subject to
         * backward-incompatible changes.*
         *
         * @name Subscription#iam
         * @mixes IAM
         *
         * @see [Access Control Overview]{@link https://cloud.google.com/pubsub/access_control}
         * @see [What is Cloud IAM?]{@link https://cloud.google.com/iam/}
         *
         * @example
         * //-
         * // Get the IAM policy for your subscription.
         * //-
         * subscription.iam.getPolicy((err, policy) => {
         *   console.log(policy);
         * });
         *
         * //-
         * // If the callback is omitted, we'll return a Promise.
         * //-
         * subscription.iam.getPolicy().then((data) => {
         *   const policy = data[0];
         *   const apiResponse = data[1];
         * });
         */
        this.iam = new iam_1.IAM(pubsub, this.name);
        this._subscriber = new subscriber_1.Subscriber(this, options);
        this._subscriber
            .on('error', err => this.emit('error', err))
            .on('message', message => this.emit('message', message))
            .on('close', () => this.emit('close'));
        this._listen();
    }
    /**
     * Indicates if the Subscription is open and receiving messages.
     *
     * @type {boolean}
     */
    get isOpen() {
        return !!(this._subscriber && this._subscriber.isOpen);
    }
    /**
     * @type {string}
     */
    get projectId() {
        return (this.pubsub && this.pubsub.projectId) || '{{projectId}}';
    }
    /**
     * Closes the Subscription, once this is called you will no longer receive
     * message events unless you call {Subscription#open} or add new message
     * listeners.
     *
     * @param {function} [callback] The callback function.
     * @param {?error} callback.err An error returned while closing the
     *     Subscription.
     *
     * @example
     * subscription.close(err => {
     *   if (err) {
     *     // Error handling omitted.
     *   }
     * });
     *
     * // If the callback is omitted a Promise will be returned.
     * subscription.close().then(() => {});
     */
    close(callback) {
        this._subscriber.close().then(() => callback(), callback);
    }
    /**
     * Create a subscription.
     *
     * @see [Subscriptions: create API Documentation]{@link https://cloud.google.com/pubsub/docs/reference/rest/v1/projects.subscriptions/create}
     *
     * @throws {Error} If subscription name is omitted.
     *
     * @param {string} name The name of the subscription.
     * @param {CreateSubscriptionRequest} [options] See a
     *     [Subscription
     * resource](https://cloud.google.com/pubsub/docs/reference/rest/v1/projects.subscriptions).
     * @param {CreateSubscriptionCallback} [callback] Callback function.
     * @returns {Promise<CreateSubscriptionResponse>}
     *
     * @example
     * const {PubSub} = require('@google-cloud/pubsub');
     * const pubsub = new PubSub();
     *
     * const topic = pubsub.topic('my-topic');
     * const subscription = topic.subscription('newMessages');
     * const callback = function(err, subscription, apiResponse) {};
     *
     * subscription.create(callback);
     *
     * @example <caption>With options</caption>
     * subscription.create({
     *   ackDeadlineSeconds: 90
     * }, callback);
     *
     * @example <caption>If the callback is omitted, we'll return a
     * Promise.</caption> const [sub, apiResponse] = await subscription.create();
     */
    create(optsOrCallback, callback) {
        if (!this.topic) {
            throw new Error('Subscriptions can only be created when accessed through Topics');
        }
        const name = this.name.split('/').pop();
        const options = typeof optsOrCallback === 'object' ? optsOrCallback : {};
        callback = typeof optsOrCallback === 'function' ? optsOrCallback : callback;
        this.pubsub.createSubscription(this.topic, name, options, (err, sub, resp) => {
            if (err) {
                callback(err, null, resp);
                return;
            }
            Object.assign(this, sub);
            callback(null, this, resp);
        });
    }
    /**
     * @typedef {array} CreateSnapshotResponse
     * @property {Snapshot} 0 The new {@link Snapshot}.
     * @property {object} 1 The full API response.
     */
    /**
     * @callback CreateSnapshotCallback
     * @param {?Error} err Request error, if any.
     * @param {Snapshot} snapshot The new {@link Snapshot}.
     * @param {object} apiResponse The full API response.
     */
    /**
     * Create a snapshot with the given name.
     *
     * @param {string} name Name of the snapshot.
     * @param {object} [gaxOpts] Request configuration options, outlined
     *     here: https://googleapis.github.io/gax-nodejs/CallSettings.html.
     * @param {CreateSnapshotCallback} [callback] Callback function.
     * @returns {Promise<CreateSnapshotResponse>}
     *
     * @example
     * const {PubSub} = require('@google-cloud/pubsub');
     * const pubsub = new PubSub();
     *
     * const topic = pubsub.topic('my-topic');
     * const subscription = topic.subscription('my-subscription');
     *
     * const callback = (err, snapshot, apiResponse) => {
     *   if (!err) {
     *     // The snapshot was created successfully.
     *   }
     * };
     *
     * subscription.createSnapshot('my-snapshot', callback);
     *
     * //-
     * // If the callback is omitted, we'll return a Promise.
     * //-
     * subscription.createSnapshot('my-snapshot').then((data) => {
     *   const snapshot = data[0];
     *   const apiResponse = data[1];
     * });
     */
    createSnapshot(name, optsOrCallback, callback) {
        if (typeof name !== 'string') {
            throw new Error('A name is required to create a snapshot.');
        }
        const gaxOpts = typeof optsOrCallback === 'object' ? optsOrCallback : {};
        callback = typeof optsOrCallback === 'function' ? optsOrCallback : callback;
        const snapshot = this.snapshot(name);
        const reqOpts = {
            name: snapshot.name,
            subscription: this.name,
        };
        this.request({
            client: 'SubscriberClient',
            method: 'createSnapshot',
            reqOpts,
            gaxOpts,
        }, (err, resp) => {
            if (err) {
                callback(err, null, resp);
                return;
            }
            snapshot.metadata = resp;
            callback(null, snapshot, resp);
        });
    }
    /**
     * Delete the subscription. Pull requests from the current subscription will
     * be errored once unsubscription is complete.
     *
     * @see [Subscriptions: delete API Documentation]{@link https://cloud.google.com/pubsub/docs/reference/rest/v1/projects.subscriptions/delete}
     *
     * @param {object} [gaxOpts] Request configuration options, outlined
     *     here: https://googleapis.github.io/gax-nodejs/CallSettings.html.
     * @param {function} [callback] The callback function.
     * @param {?error} callback.err An error returned while making this
     *     request.
     * @param {object} callback.apiResponse Raw API response.
     *
     * @example
     * const {PubSub} = require('@google-cloud/pubsub');
     * const pubsub = new PubSub();
     *
     * const topic = pubsub.topic('my-topic');
     * const subscription = topic.subscription('my-subscription');
     *
     * subscription.delete((err, apiResponse) => {});
     *
     * //-
     * // If the callback is omitted, we'll return a Promise.
     * //-
     * subscription.delete().then((data) => {
     *   const apiResponse = data[0];
     * });
     */
    delete(optsOrCallback, callback) {
        const gaxOpts = typeof optsOrCallback === 'object' ? optsOrCallback : {};
        callback = typeof optsOrCallback === 'function' ? optsOrCallback : callback;
        const reqOpts = {
            subscription: this.name,
        };
        if (this.isOpen) {
            this._subscriber.close();
        }
        this.request({
            client: 'SubscriberClient',
            method: 'deleteSubscription',
            reqOpts,
            gaxOpts,
        }, callback);
    }
    /**
     * @typedef {array} SubscriptionExistsResponse
     * @property {boolean} 0 Whether the subscription exists
     */
    /**
     * @callback SubscriptionExistsCallback
     * @param {?Error} err Request error, if any.
     * @param {boolean} exists Whether the subscription exists.
     */
    /**
     * Check if a subscription exists.
     *
     * @param {SubscriptionExistsCallback} [callback] Callback function.
     * @returns {Promise<SubscriptionExistsResponse>}
     *
     * @example
     * const {PubSub} = require('@google-cloud/pubsub');
     * const pubsub = new PubSub();
     *
     * const topic = pubsub.topic('my-topic');
     * const subscription = topic.subscription('my-subscription');
     *
     * subscription.exists((err, exists) => {});
     *
     * //-
     * // If the callback is omitted, we'll return a Promise.
     * //-
     * subscription.exists().then((data) => {
     *   const exists = data[0];
     * });
     */
    exists(callback) {
        this.getMetadata(err => {
            if (!err) {
                callback(null, true);
                return;
            }
            if (err.code === 5) {
                callback(null, false);
                return;
            }
            callback(err);
        });
    }
    /**
     * @typedef {array} GetSubscriptionResponse
     * @property {Subscription} 0 The {@link Subscription}.
     * @property {object} 1 The full API response.
     */
    /**
     * @callback GetSubscriptionCallback
     * @param {?Error} err Request error, if any.
     * @param {Subscription} subscription The {@link Subscription}.
     * @param {object} apiResponse The full API response.
     */
    /**
     * Get a subscription if it exists.
     *
     * @param {object} [gaxOpts] Request configuration options, outlined
     *     here: https://googleapis.github.io/gax-nodejs/CallSettings.html.
     * @param {boolean} [gaxOpts.autoCreate=false] Automatically create the
     *     subscription if it does not already exist.
     * @param {GetSubscriptionCallback} [callback] Callback function.
     * @returns {Promise<GetSubscriptionResponse>}
     *
     * @example
     * const {PubSub} = require('@google-cloud/pubsub');
     * const pubsub = new PubSub();
     *
     * const topic = pubsub.topic('my-topic');
     * const subscription = topic.subscription('my-subscription');
     *
     * subscription.get((err, subscription, apiResponse) => {
     *   // The `subscription` data has been populated.
     * });
     *
     * //-
     * // If the callback is omitted, we'll return a Promise.
     * //-
     * subscription.get().then((data) => {
     *   const subscription = data[0];
     *   const apiResponse = data[1];
     * });
     */
    get(optsOrCallback, callback) {
        const gaxOpts = typeof optsOrCallback === 'object' ? optsOrCallback : {};
        callback = typeof optsOrCallback === 'function' ? optsOrCallback : callback;
        const autoCreate = !!gaxOpts.autoCreate && this.topic;
        delete gaxOpts.autoCreate;
        this.getMetadata(gaxOpts, (err, apiResponse) => {
            if (!err) {
                callback(null, this, apiResponse);
                return;
            }
            if (err.code !== 5 || !autoCreate) {
                callback(err, null, apiResponse);
                return;
            }
            this.create({ gaxOpts }, callback);
        });
    }
    /**
     * @typedef {array} GetSubscriptionMetadataResponse
     * @property {object} 0 The full API response.
     */
    /**
     * @callback GetSubscriptionMetadataCallback
     * @param {?Error} err Request error, if any.
     * @param {object} apiResponse The full API response.
     */
    /**
     * Fetches the subscriptions metadata.
     *
     * @param {object} [gaxOpts] Request configuration options, outlined
     *     here: https://googleapis.github.io/gax-nodejs/CallSettings.html.
     * @param {GetSubscriptionMetadataCallback} [callback] Callback function.
     * @returns {Promise<GetSubscriptionMetadataResponse>}
     *
     * @example
     * const {PubSub} = require('@google-cloud/pubsub');
     * const pubsub = new PubSub();
     *
     * const topic = pubsub.topic('my-topic');
     * const subscription = topic.subscription('my-subscription');
     *
     * subscription.getMetadata((err, apiResponse) => {
     *   if (err) {
     *     // Error handling omitted.
     *   }
     * });
     *
     * //-
     * // If the callback is omitted, we'll return a Promise.
     * //-
     * subscription.getMetadata().then((data) => {
     *   const apiResponse = data[0];
     * });
     */
    getMetadata(optsOrCallback, callback) {
        const gaxOpts = typeof optsOrCallback === 'object' ? optsOrCallback : {};
        callback = typeof optsOrCallback === 'function' ? optsOrCallback : callback;
        const reqOpts = {
            subscription: this.name,
        };
        this.request({
            client: 'SubscriberClient',
            method: 'getSubscription',
            reqOpts,
            gaxOpts,
        }, (err, apiResponse) => {
            if (!err) {
                this.metadata = apiResponse;
            }
            callback(err, apiResponse);
        });
    }
    /**
     * @typedef {array} ModifyPushConfigResponse
     * @property {object} 0 The full API response.
     */
    /**
     * @callback ModifyPushConfigCallback
     * @param {?Error} err Request error, if any.
     * @param {object} apiResponse The full API response.
     */
    /**
     * Modify the push config for the subscription.
     *
     * @param {object} config The push config.
     * @param {string} config.pushEndpoint A URL locating the endpoint to which
     *     messages should be published.
     * @param {object} config.attributes [PushConfig attributes](https://cloud.google.com/pubsub/docs/reference/rpc/google.pubsub.v1#google.pubsub.v1.PushConfig).
     * @param {object} [gaxOpts] Request configuration options, outlined
     *     here: https://googleapis.github.io/gax-nodejs/CallSettings.html.
     * @param {ModifyPushConfigCallback} [callback] Callback function.
     * @returns {Promise<ModifyPushConfigResponse>}
     *
     * @example
     * const {PubSub} = require('@google-cloud/pubsub');
     * const pubsub = new PubSub();
     *
     * const topic = pubsub.topic('my-topic');
     * const subscription = topic.subscription('my-subscription');
     *
     * const pushConfig = {
     *   pushEndpoint: 'https://mydomain.com/push',
     *   attributes: {
     *     key: 'value'
     *   }
     * };
     *
     * subscription.modifyPushConfig(pushConfig, (err, apiResponse) => {
     *   if (err) {
     *     // Error handling omitted.
     *   }
     * });
     *
     * //-
     * // If the callback is omitted, we'll return a Promise.
     * //-
     * subscription.modifyPushConfig(pushConfig).then((data) => {
     *   const apiResponse = data[0];
     * });
     */
    modifyPushConfig(config, optsOrCallback, callback) {
        const gaxOpts = typeof optsOrCallback === 'object' ? optsOrCallback : {};
        callback = typeof optsOrCallback === 'function' ? optsOrCallback : callback;
        const reqOpts = {
            subscription: this.name,
            pushConfig: config,
        };
        this.request({
            client: 'SubscriberClient',
            method: 'modifyPushConfig',
            reqOpts,
            gaxOpts,
        }, callback);
    }
    /**
     * Opens the Subscription to receive messages. In general this method
     * shouldn't need to be called, unless you wish to receive messages after
     * calling {@link Subscription#close}. Alternatively one could just assign a
     * new `message` event listener which will also re-open the Subscription.
     *
     * @example
     * subscription.on('message', message => message.ack());
     *
     * // Close the subscription.
     * subscription.close(err => {
     *   if (err) {
     *     // Error handling omitted.
     *   }
     *
     *   The subscription has been closed and messages will no longer be received.
     * });
     *
     * // Resume receiving messages.
     * subscription.open();
     */
    open() {
        if (!this._subscriber.isOpen) {
            this._subscriber.open();
        }
    }
    /**
     * @typedef {array} SeekResponse
     * @property {object} 0 The full API response.
     */
    /**
     * @callback SeekCallback
     * @param {?Error} err Request error, if any.
     * @param {object} apiResponse The full API response.
     */
    /**
     * Seeks an existing subscription to a point in time or a given snapshot.
     *
     * @param {string|date} snapshot The point to seek to. This will accept the
     *     name of the snapshot or a Date object.
     * @param {object} [gaxOpts] Request configuration options, outlined
     *     here: https://googleapis.github.io/gax-nodejs/CallSettings.html.
     * @param {SeekCallback} [callback] Callback function.
     * @returns {Promise<SeekResponse>}
     *
     * @example
     * const callback = (err, resp) => {
     *   if (!err) {
     *     // Seek was successful.
     *   }
     * };
     *
     * subscription.seek('my-snapshot', callback);
     *
     * //-
     * // Alternatively, to specify a certain point in time, you can provide a
     * Date
     * // object.
     * //-
     * const date = new Date('October 21 2015');
     *
     * subscription.seek(date, callback);
     */
    seek(snapshot, optsOrCallback, callback) {
        const gaxOpts = typeof optsOrCallback === 'object' ? optsOrCallback : {};
        callback = typeof optsOrCallback === 'function' ? optsOrCallback : callback;
        const reqOpts = {
            subscription: this.name,
        };
        if (typeof snapshot === 'string') {
            reqOpts.snapshot = snapshot_1.Snapshot.formatName_(this.pubsub.projectId, snapshot);
        }
        else if (Object.prototype.toString.call(snapshot) === '[object Date]') {
            reqOpts.time = snapshot;
        }
        else {
            throw new Error('Either a snapshot name or Date is needed to seek to.');
        }
        this.request({
            client: 'SubscriberClient',
            method: 'seek',
            reqOpts,
            gaxOpts,
        }, callback);
    }
    /**
     * @typedef {array} SetSubscriptionMetadataResponse
     * @property {object} 0 The full API response.
     */
    /**
     * @callback SetSubscriptionMetadataCallback
     * @param {?Error} err Request error, if any.
     * @param {object} apiResponse The full API response.
     */
    /**
     * Update the subscription object.
     *
     * @param {object} metadata The subscription metadata.
     * @param {object} [gaxOpts] Request configuration options, outlined
     *     here: https://googleapis.github.io/gax-nodejs/CallSettings.html.
     * @param {SetSubscriptionMetadataCallback} [callback] Callback function.
     * @returns {Promise<SetSubscriptionMetadataResponse>}
     *
     * @example
     * const metadata = {
     *   key: 'value'
     * };
     *
     * subscription.setMetadata(metadata, (err, apiResponse) => {
     *   if (err) {
     *     // Error handling omitted.
     *   }
     * });
     *
     * //-
     * // If the callback is omitted, we'll return a Promise.
     * //-
     * subscription.setMetadata(metadata).then((data) => {
     *   const apiResponse = data[0];
     * });
     */
    setMetadata(metadata, optsOrCallback, callback) {
        const gaxOpts = typeof optsOrCallback === 'object' ? optsOrCallback : {};
        callback = typeof optsOrCallback === 'function' ? optsOrCallback : callback;
        const subscription = Subscription.formatMetadata_(metadata);
        const fields = Object.keys(subscription).map(snakeCase);
        subscription.name = this.name;
        const reqOpts = {
            subscription,
            updateMask: {
                paths: fields,
            },
        };
        this.request({
            client: 'SubscriberClient',
            method: 'updateSubscription',
            reqOpts,
            gaxOpts,
        }, callback);
    }
    /**
     * Sets the Subscription options.
     *
     * @param {SubscriberOptions} options The options.
     */
    setOptions(options) {
        this._subscriber.setOptions(options);
    }
    /**
     * Create a Snapshot object. See {@link Subscription#createSnapshot} to
     * create a snapshot.
     *
     * @throws {Error} If a name is not provided.
     *
     * @param {string} name The name of the snapshot.
     * @returns {Snapshot}
     *
     * @example
     * const snapshot = subscription.snapshot('my-snapshot');
     */
    snapshot(name) {
        return this.pubsub.snapshot.call(this, name);
    }
    /**
     * Watches for incoming message event handlers and open/closes the
     * subscriber as needed.
     *
     * @private
     */
    _listen() {
        this.on('newListener', event => {
            if (!this.isOpen && event === 'message') {
                this._subscriber.open();
            }
        });
        this.on('removeListener', event => {
            if (this.isOpen && this.listenerCount('message') === 0) {
                this._subscriber.close();
            }
        });
    }
    /*!
     * Formats Subscription metadata.
     *
     * @private
     */
    static formatMetadata_(metadata) {
        const formatted = extend(true, {}, metadata);
        if (typeof metadata.messageRetentionDuration === 'number') {
            formatted.messageRetentionDuration = {
                seconds: metadata.messageRetentionDuration,
                nanos: 0,
            };
        }
        if (metadata.pushEndpoint) {
            formatted.pushConfig = {
                pushEndpoint: metadata.pushEndpoint,
            };
            delete formatted.pushEndpoint;
        }
        return formatted;
    }
    /*!
     * Format the name of a subscription. A subscription's full name is in the
     * format of projects/{projectId}/subscriptions/{subName}.
     *
     * @private
     */
    static formatName_(projectId, name) {
        // Simple check if the name is already formatted.
        if (name.indexOf('/') > -1) {
            return name;
        }
        return 'projects/' + projectId + '/subscriptions/' + name;
    }
}
exports.Subscription = Subscription;
/*! Developer Documentation
 *
 * All async methods (except for streams) will return a Promise in the event
 * that a callback is omitted.
 */
promisify_1.promisifyAll(Subscription, {
    exclude: ['open', 'snapshot'],
});
//# sourceMappingURL=subscription.js.map