"use strict";
/*!
 * Copyright 2018 Google Inc. All Rights Reserved.
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
const grpc_js_1 = require("@grpc/grpc-js");
const isStreamEnded = require("is-stream-ended");
const stream_1 = require("stream");
const pull_retry_1 = require("./pull-retry");
/*!
 * Frequency to ping streams.
 */
const KEEP_ALIVE_INTERVAL = 30000;
/*!
 * Deadline for the stream.
 */
const PULL_TIMEOUT = require('./v1/subscriber_client_config.json').interfaces['google.pubsub.v1.Subscriber'].methods.StreamingPull.timeout_millis;
/*!
 * default stream options
 */
const DEFAULT_OPTIONS = {
    highWaterMark: 0,
    maxStreams: 5,
    timeout: 300000,
};
/**
 * Error wrapper for gRPC status objects.
 *
 * @class
 *
 * @param {object} status The gRPC status object.
 */
class StatusError extends Error {
    constructor(status) {
        super(status.details);
        this.code = status.code;
        this.details = status.details;
        this.metadata = status.metadata;
    }
}
exports.StatusError = StatusError;
/**
 * Error thrown when we fail to open a channel for the message stream.
 *
 * @class
 *
 * @param {Error} err The original error.
 */
class ChannelError extends Error {
    constructor(err) {
        super(`Failed to connect to channel. Reason: ${process.env.DEBUG_GRPC ? err.stack : err.message}`);
        this.code = err.message.includes('deadline')
            ? grpc_js_1.status.DEADLINE_EXCEEDED
            : grpc_js_1.status.UNKNOWN;
        this.details = err.message;
        this.metadata = new grpc_js_1.Metadata();
    }
}
exports.ChannelError = ChannelError;
/**
 * @typedef {object} MessageStreamOptions
 * @property {number} [highWaterMark=0] Configures the Buffer level for all
 *     underlying streams. See
 *     {@link https://nodejs.org/en/docs/guides/backpressuring-in-streams/} for
 *     more details.
 * @property {number} [maxStreams=5] Number of streaming connections to make.
 * @property {number} [timeout=300000] Timeout for establishing a connection.
 */
/**
 * Streaming class used to manage multiple StreamingPull requests.
 *
 * @private
 * @class
 *
 * @param {Subscriber} sub The parent subscriber.
 * @param {MessageStreamOptions} [options] The message stream options.
 */
class MessageStream extends stream_1.PassThrough {
    constructor(sub, options = {}) {
        options = Object.assign({}, DEFAULT_OPTIONS, options);
        super({ objectMode: true, highWaterMark: options.highWaterMark });
        this.destroyed = false;
        this._options = options;
        this._retrier = new pull_retry_1.PullRetry();
        this._streams = new Map();
        this._subscriber = sub;
        this._fillStreamPool();
        this._keepAliveHandle = setInterval(() => this._keepAlive(), KEEP_ALIVE_INTERVAL);
        this._keepAliveHandle.unref();
    }
    /**
     * Destroys the stream and any underlying streams.
     *
     * @param {error?} err An error to emit, if any.
     * @private
     */
    destroy(err) {
        if (this.destroyed) {
            return;
        }
        this.destroyed = true;
        clearInterval(this._keepAliveHandle);
        for (const stream of this._streams.keys()) {
            this._removeStream(stream);
            stream.cancel();
        }
        if (typeof super.destroy === 'function') {
            return super.destroy(err);
        }
        process.nextTick(() => {
            if (err) {
                this.emit('error', err);
            }
            this.emit('close');
        });
    }
    /**
     * Adds a StreamingPull stream to the combined stream.
     *
     * @private
     *
     * @param {stream} stream The StreamingPull stream.
     */
    _addStream(stream) {
        this._setHighWaterMark(stream);
        this._streams.set(stream, false);
        stream
            .on('error', err => this._onError(stream, err))
            .once('status', status => this._onStatus(stream, status))
            .pipe(this, { end: false });
    }
    /**
     * Attempts to create and cache the desired number of StreamingPull requests.
     * gRPC does not supply a way to confirm that a stream is connected, so our
     * best bet is to open the streams and use the client.waitForReady() method to
     * confirm everything is ok.
     *
     * @private
     *
     * @returns {Promise}
     */
    async _fillStreamPool() {
        let client;
        try {
            client = await this._getClient();
        }
        catch (e) {
            this.destroy(e);
        }
        if (this.destroyed) {
            return;
        }
        const deadline = Date.now() + PULL_TIMEOUT;
        const request = {
            subscription: this._subscriber.name,
            streamAckDeadlineSeconds: this._subscriber.ackDeadline,
        };
        delete this._fillHandle;
        for (let i = this._streams.size; i < this._options.maxStreams; i++) {
            const stream = client.streamingPull({ deadline });
            this._addStream(stream);
            stream.write(request);
        }
        try {
            await this._waitForClientReady(client);
        }
        catch (e) {
            this.destroy(e);
        }
    }
    /**
     * It is critical that we keep as few `PullResponse` objects in memory as
     * possible to reduce the number of potential redeliveries. Because of this we
     * want to bypass gax for StreamingPull requests to avoid creating a Duplexify
     * stream, doing so essentially doubles the size of our readable buffer.
     *
     * @private
     *
     * @returns {Promise.<object>}
     */
    async _getClient() {
        const client = await this._subscriber.getClient();
        return client.getSubscriberStub();
    }
    /**
     * Since we do not use the streams to ack/modAck messages, they will close
     * by themselves unless we periodically send empty messages.
     *
     * @private
     */
    _keepAlive() {
        this._streams.forEach((receivedStatus, stream) => {
            // its possible that a status event fires off (signaling the rpc being
            // closed) but the stream hasn't drained yet, writing to this stream will
            // result in a `write after end` error
            if (!receivedStatus) {
                stream.write({});
            }
        });
    }
    /**
     * Once the stream has nothing left to read, we'll remove it and attempt to
     * refill our stream pool if needed.
     *
     * @private
     *
     * @param {Duplex} stream The ended stream.
     * @param {object} status The stream status.
     */
    _onEnd(stream, status) {
        this._removeStream(stream);
        if (this._fillHandle) {
            return;
        }
        if (this._retrier.retry(status)) {
            const delay = this._retrier.createTimeout();
            this._fillHandle = setTimeout(() => this._fillStreamPool(), delay);
        }
        else if (!this._streams.size) {
            this.destroy(new StatusError(status));
        }
    }
    /**
     * gRPC will usually emit a status as a ServiceError via `error` event before
     * it emits the status itself. In order to cut back on emitted errors, we'll
     * wait a tick on error and ignore it if the status has been received.
     *
     * @private
     *
     * @param {stream} stream The stream that errored.
     * @param {Error} err The error.
     */
    async _onError(stream, err) {
        await promisify_1.promisify(setImmediate)();
        const code = err.code;
        const receivedStatus = this._streams.get(stream) !== false;
        if (typeof code !== 'number' || !receivedStatus) {
            this.emit('error', err);
        }
    }
    /**
     * gRPC streams will emit a status event once the connection has been
     * terminated. This is preferable to end/close events because we'll receive
     * information as to why the stream closed and if it is safe to open another.
     *
     * @private
     *
     * @param {stream} stream The stream that was closed.
     * @param {object} status The status message stating why it was closed.
     */
    _onStatus(stream, status) {
        if (this.destroyed) {
            return;
        }
        this._streams.set(stream, true);
        if (isStreamEnded(stream)) {
            this._onEnd(stream, status);
        }
        else {
            stream.once('end', () => this._onEnd(stream, status));
            stream.push(null);
        }
    }
    /**
     * Removes a stream from the combined stream.
     *
     * @private
     *
     * @param {stream} stream The stream to remove.
     */
    _removeStream(stream) {
        stream.unpipe(this);
        this._streams.delete(stream);
    }
    /**
     * Neither gRPC or gax allow for the highWaterMark option to be specified.
     * However using the default value (16) it is possible to end up with a lot of
     * PullResponse objects stored in internal buffers. If this were to happen
     * and the client were slow to process messages, we could potentially see a
     * very large number of redeliveries happen before the messages even made it
     * to the client.
     *
     * @private
     *
     * @param {Duplex} stream The duplex stream to adjust the
     *     highWaterMarks for.
     */
    _setHighWaterMark(stream) {
        stream._readableState.highWaterMark = this._options.highWaterMark;
    }
    /**
     * Promisified version of gRPCs Client#waitForReady function.
     *
     * @private
     *
     * @param {object} client The gRPC client to wait for.
     * @returns {Promise}
     */
    async _waitForClientReady(client) {
        const deadline = Date.now() + this._options.timeout;
        try {
            await promisify_1.promisify(client.waitForReady).call(client, deadline);
        }
        catch (e) {
            throw new ChannelError(e);
        }
    }
}
exports.MessageStream = MessageStream;
//# sourceMappingURL=message-stream.js.map