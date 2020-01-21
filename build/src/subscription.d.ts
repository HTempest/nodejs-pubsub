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
/// <reference types="node" />
import { EventEmitter } from 'events';
import { CallOptions } from 'google-gax';
import { google } from '../proto/pubsub';
import { IAM } from './iam';
import { FlowControlOptions } from './lease-manager';
import { EmptyCallback, EmptyResponse, ExistsCallback, ExistsResponse, Omit, PubSub, RequestCallback, ResourceCallback } from './pubsub';
import { CreateSnapshotCallback, CreateSnapshotResponse, SeekCallback, SeekResponse, Snapshot } from './snapshot';
import { SubscriberOptions } from './subscriber';
import { Topic } from './topic';
export declare type PushConfig = google.pubsub.v1.IPushConfig;
export declare type SubscriptionMetadata = {
    messageRetentionDuration?: google.protobuf.IDuration | number;
    pushEndpoint?: string;
} & Omit<google.pubsub.v1.ISubscription, 'messageRetentionDuration'>;
export declare type SubscriptionOptions = SubscriberOptions & {
    topic?: Topic;
};
export declare type SubscriptionCloseCallback = (err?: Error) => void;
declare type SubscriptionCallback = ResourceCallback<Subscription, google.pubsub.v1.ISubscription>;
declare type SubscriptionResponse = [Subscription, google.pubsub.v1.ISubscription];
export declare type CreateSubscriptionOptions = SubscriptionMetadata & {
    gaxOpts?: CallOptions;
    flowControl?: FlowControlOptions;
};
export declare type CreateSubscriptionCallback = SubscriptionCallback;
export declare type CreateSubscriptionResponse = SubscriptionResponse;
export declare type GetSubscriptionOptions = CallOptions & {
    autoCreate?: boolean;
};
export declare type GetSubscriptionCallback = SubscriptionCallback;
export declare type GetSubscriptionResponse = SubscriptionResponse;
declare type MetadataCallback = RequestCallback<google.pubsub.v1.ISubscription>;
declare type MetadataResponse = [google.pubsub.v1.ISubscription];
export declare type GetSubscriptionMetadataCallback = MetadataCallback;
export declare type GetSubscriptionMetadataResponse = MetadataResponse;
export declare type SetSubscriptionMetadataCallback = MetadataCallback;
export declare type SetSubscriptionMetadataResponse = MetadataResponse;
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
export declare class Subscription extends EventEmitter {
    pubsub: PubSub;
    iam: IAM;
    name: string;
    topic?: Topic | string;
    metadata?: google.pubsub.v1.ISubscription;
    request: typeof PubSub.prototype.request;
    private _subscriber;
    constructor(pubsub: PubSub, name: string, options?: SubscriptionOptions);
    /**
     * Indicates if the Subscription is open and receiving messages.
     *
     * @type {boolean}
     */
    readonly isOpen: boolean;
    /**
     * @type {string}
     */
    readonly projectId: string;
    close(): Promise<void>;
    close(callback: SubscriptionCloseCallback): void;
    create(options?: CreateSubscriptionOptions): Promise<CreateSubscriptionResponse>;
    create(callback: CreateSubscriptionCallback): void;
    create(options: CreateSubscriptionOptions, callback: CreateSubscriptionCallback): void;
    createSnapshot(name: string, gaxOpts?: CallOptions): Promise<CreateSnapshotResponse>;
    createSnapshot(name: string, callback: CreateSnapshotCallback): void;
    createSnapshot(name: string, gaxOpts: CallOptions, callback: CreateSnapshotCallback): void;
    delete(gaxOpts?: CallOptions): Promise<EmptyResponse>;
    delete(callback: EmptyCallback): void;
    delete(gaxOpts: CallOptions, callback: EmptyCallback): void;
    exists(): Promise<ExistsResponse>;
    exists(callback: ExistsCallback): void;
    get(gaxOpts?: GetSubscriptionOptions): Promise<GetSubscriptionResponse>;
    get(callback: GetSubscriptionCallback): void;
    get(gaxOpts: GetSubscriptionOptions, callback: GetSubscriptionCallback): void;
    getMetadata(gaxOpts?: CallOptions): Promise<GetSubscriptionMetadataResponse>;
    getMetadata(callback: GetSubscriptionMetadataCallback): void;
    getMetadata(gaxOpts: CallOptions, callback: GetSubscriptionMetadataCallback): void;
    modifyPushConfig(config: PushConfig, gaxOpts?: CallOptions): Promise<EmptyResponse>;
    modifyPushConfig(config: PushConfig, callback: EmptyCallback): void;
    modifyPushConfig(config: PushConfig, gaxOpts: CallOptions, callback: EmptyCallback): void;
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
    open(): void;
    seek(snapshot: string | Date, gaxOpts?: CallOptions): Promise<SeekResponse>;
    seek(snapshot: string | Date, callback: SeekCallback): void;
    seek(snapshot: string | Date, gaxOpts: CallOptions, callback: SeekCallback): void;
    setMetadata(metadata: SubscriptionMetadata, gaxOpts?: CallOptions): Promise<SetSubscriptionMetadataResponse>;
    setMetadata(metadata: SubscriptionMetadata, callback: SetSubscriptionMetadataCallback): void;
    setMetadata(metadata: SubscriptionMetadata, gaxOpts: CallOptions, callback: SetSubscriptionMetadataCallback): void;
    /**
     * Sets the Subscription options.
     *
     * @param {SubscriberOptions} options The options.
     */
    setOptions(options: SubscriberOptions): void;
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
    snapshot(name: string): Snapshot;
    /**
     * Watches for incoming message event handlers and open/closes the
     * subscriber as needed.
     *
     * @private
     */
    private _listen;
    /*!
     * Formats Subscription metadata.
     *
     * @private
     */
    static formatMetadata_(metadata: SubscriptionMetadata): google.pubsub.v1.ISubscription;
    /*!
     * Format the name of a subscription. A subscription's full name is in the
     * format of projects/{projectId}/subscriptions/{subName}.
     *
     * @private
     */
    static formatName_(projectId: string, name: string): string;
}
export {};