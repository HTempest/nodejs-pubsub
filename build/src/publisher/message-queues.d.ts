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
/// <reference types="node" />
import { ServiceError } from '@grpc/grpc-js';
import { EventEmitter } from 'events';
import { BatchPublishOptions, MessageBatch } from './message-batch';
import { PublishError } from './publish-error';
import { Publisher, PubsubMessage, PublishCallback } from './';
export interface PublishDone {
    (err: ServiceError | null): void;
}
/**
 * Queues are used to manage publishing batches of messages.
 *
 * @private
 *
 * @param {Publisher} publisher The parent publisher.
 */
export declare abstract class MessageQueue extends EventEmitter {
    batchOptions: BatchPublishOptions;
    publisher: Publisher;
    pending?: NodeJS.Timer;
    constructor(publisher: Publisher);
    /**
     * Adds a message to the queue.
     *
     * @abstract
     *
     * @param {object} message The message to publish.
     * @param {PublishCallback} callback The publish callback.
     */
    abstract add(message: PubsubMessage, callback: PublishCallback): void;
    /**
     * Method to initiate publishing.
     *
     * @abstract
     */
    abstract publish(): void;
    /**
     * Accepts a batch of messages and publishes them to the API.
     *
     * @param {object[]} messages The messages to publish.
     * @param {PublishCallback[]} callbacks The corresponding callback functions.
     * @param {function} [callback] Callback to be fired when publish is done.
     */
    _publish(messages: PubsubMessage[], callbacks: PublishCallback[], callback?: PublishDone): void;
}
/**
 * Standard message queue used for publishing messages.
 *
 * @private
 * @extends MessageQueue
 *
 * @param {Publisher} publisher The publisher.
 */
export declare class Queue extends MessageQueue {
    batch: MessageBatch;
    constructor(publisher: Publisher);
    /**
     * Adds a message to the queue.
     *
     * @param {PubsubMessage} message The message to publish.
     * @param {PublishCallback} callback The publish callback.
     */
    add(message: PubsubMessage, callback: PublishCallback): void;
    /**
     * Cancels any pending publishes and calls _publish immediately.
     */
    publish(): void;
}
/**
 * Queue for handling ordered messages. Unlike the standard queue, this
 * ensures that batches are published one at a time and throws an exception in
 * the event that any batch fails to publish.
 *
 * @private
 * @extends MessageQueue
 *
 * @param {Publisher} publisher The publisher.
 * @param {string} key The key used to order the messages.
 */
export declare class OrderedQueue extends MessageQueue {
    batches: MessageBatch[];
    inFlight: boolean;
    error?: null | PublishError;
    key: string;
    constructor(publisher: Publisher, key: string);
    /**
     * Reference to the batch we're currently filling.
     * @returns {MessageBatch}
     */
    readonly currentBatch: MessageBatch;
    /**
     * Adds a message to a batch, creating a new batch if need be.
     *
     * @param {object} message The message to publish.
     * @param {PublishCallback} callback The publish callback.
     */
    add(message: PubsubMessage, callback: PublishCallback): void;
    /**
     * Starts a timeout to publish any pending messages.
     */
    beginNextPublish(): void;
    /**
     * Creates a new {@link MessageBatch} instance.
     *
     * @returns {MessageBatch}
     */
    createBatch(): MessageBatch;
    /**
     * In the event of a publish failure, we need to cache the error in question
     * and reject all pending publish calls, prompting the user to call
     * {@link OrderedQueue#resumePublishing}.
     *
     * @param {Error} err The publishing error.
     */
    handlePublishFailure(err: ServiceError): void;
    /**
     * Publishes the messages. If successful it will prepare the next batch to be
     * published immediately after. If an error occurs, it will reject all
     * pending messages. In the event that no pending messages/batches are left,
     * a "drain" event will be fired, indicating to the publisher that it is
     * safe to delete this queue.
     *
     * @fires OrderedQueue#drain
     */
    publish(): void;
    /**
     * Tells the queue it is ok to continue publishing messages.
     */
    resumePublishing(): void;
}