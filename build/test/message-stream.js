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
const proxyquire = require("proxyquire");
const sinon = require("sinon");
const stream_1 = require("stream");
const uuid = require("uuid");
const FAKE_STREAMING_PULL_TIMEOUT = 123456789;
const FAKE_CLIENT_CONFIG = {
    interfaces: {
        'google.pubsub.v1.Subscriber': {
            methods: {
                StreamingPull: {
                    timeout_millis: FAKE_STREAMING_PULL_TIMEOUT,
                },
            },
        },
    },
};
// just need this for unit tests.. we have a ponyfill for destroy on
// MessageStream and gax streams use Duplexify
function destroy(stream, err) {
    process.nextTick(() => {
        if (err) {
            stream.emit('error', err);
        }
        stream.emit('close');
    });
}
class FakePassThrough extends stream_1.PassThrough {
    constructor(options) {
        super(options);
        this.options = options;
    }
    destroy(err) {
        if (super.destroy) {
            return super.destroy(err);
        }
        destroy(this, err);
    }
}
class FakeGrpcStream extends stream_1.Duplex {
    constructor(options) {
        super({ objectMode: true });
        this.options = options;
    }
    cancel() {
        const status = {
            code: 1,
            details: 'Canceled.',
            metadata: new grpc_js_1.Metadata(),
        };
        process.nextTick(() => {
            this.emit('status', status);
            this.end();
        });
    }
    destroy(err) {
        if (super.destroy) {
            return super.destroy(err);
        }
        destroy(this, err);
    }
    _write(chunk, encoding, callback) {
        callback();
    }
    _read(size) { }
}
class FakeGaxClient {
    constructor() {
        this.client = new FakeGrpcClient();
    }
    async getSubscriberStub() {
        return this.client;
    }
}
class FakeGrpcClient {
    constructor() {
        this.streams = [];
    }
    streamingPull(options) {
        const stream = new FakeGrpcStream(options);
        this.streams.push(stream);
        return stream;
    }
    waitForReady(deadline, callback) {
        this.deadline = deadline;
        callback();
    }
}
class FakeSubscriber {
    constructor(client) {
        this.name = uuid.v4();
        this.ackDeadline = Math.floor(Math.random() * 600);
        this.client = client;
    }
    async getClient() {
        return this.client;
    }
}
mocha_1.describe('MessageStream', () => {
    const sandbox = sinon.createSandbox();
    let client;
    let subscriber;
    // tslint:disable-next-line variable-name
    let MessageStream;
    let messageStream;
    let now;
    before(() => {
        MessageStream = proxyquire('../src/message-stream.js', {
            stream: { PassThrough: FakePassThrough },
            './v1/subscriber_client_config.json': FAKE_CLIENT_CONFIG,
        }).MessageStream;
    });
    beforeEach(() => {
        now = Date.now();
        sandbox.stub(global.Date, 'now').returns(now);
        const gaxClient = new FakeGaxClient();
        client = gaxClient.client; // we hit the grpc client directly
        subscriber = new FakeSubscriber(gaxClient);
        messageStream = new MessageStream(subscriber);
    });
    afterEach(() => {
        messageStream.destroy();
        sandbox.restore();
    });
    mocha_1.describe('initialization', () => {
        mocha_1.it('should create an object mode stream', () => {
            const expectedOptions = {
                objectMode: true,
                highWaterMark: 0,
            };
            assert.deepStrictEqual(messageStream.options, expectedOptions);
        });
        mocha_1.it('should respect the highWaterMark option', () => {
            const highWaterMark = 3;
            const ms = new MessageStream(subscriber, { highWaterMark });
            const expectedOptions = {
                objectMode: true,
                highWaterMark,
            };
            assert.deepStrictEqual(ms.options, expectedOptions);
        });
        mocha_1.it('should set destroyed to false', () => {
            assert.strictEqual(messageStream.destroyed, false);
        });
        mocha_1.describe('options', () => {
            mocha_1.describe('defaults', () => {
                mocha_1.it('should default highWaterMark to 0', () => {
                    client.streams.forEach(stream => {
                        assert.strictEqual(stream._readableState.highWaterMark, 0);
                    });
                });
                mocha_1.it('should default maxStreams to 5', () => {
                    assert.strictEqual(client.streams.length, 5);
                });
                mocha_1.it('should pull pullTimeouts default from config file', () => {
                    const expectedDeadline = now + FAKE_STREAMING_PULL_TIMEOUT;
                    client.streams.forEach(stream => {
                        const deadline = stream.options.deadline;
                        assert.strictEqual(deadline, expectedDeadline);
                    });
                });
                mocha_1.it('should default timeout to 5 minutes', () => {
                    const expectedTimeout = now + 60000 * 5;
                    assert.strictEqual(client.deadline, expectedTimeout);
                });
            });
            mocha_1.describe('user options', () => {
                beforeEach(() => {
                    messageStream.destroy();
                    client.streams.length = 0;
                    delete client.deadline;
                });
                mocha_1.it('should respect the highWaterMark option', done => {
                    const highWaterMark = 3;
                    messageStream = new MessageStream(subscriber, { highWaterMark });
                    setImmediate(() => {
                        assert.strictEqual(client.streams.length, 5);
                        client.streams.forEach(stream => {
                            assert.strictEqual(stream._readableState.highWaterMark, highWaterMark);
                        });
                        done();
                    });
                });
                mocha_1.it('should respect the maxStreams option', done => {
                    const maxStreams = 3;
                    messageStream = new MessageStream(subscriber, { maxStreams });
                    setImmediate(() => {
                        assert.strictEqual(client.streams.length, maxStreams);
                        done();
                    });
                });
                mocha_1.it('should respect the timeout option', done => {
                    const timeout = 12345;
                    const expectedDeadline = now + timeout;
                    messageStream = new MessageStream(subscriber, { timeout });
                    setImmediate(() => {
                        assert.strictEqual(client.deadline, now + timeout);
                        done();
                    });
                });
            });
        });
    });
    mocha_1.describe('destroy', () => {
        mocha_1.it('should noop if already destroyed', done => {
            const stub = sandbox
                .stub(FakePassThrough.prototype, 'destroy')
                .callsFake(function () {
                if (this === messageStream) {
                    done();
                }
            });
            messageStream.destroy();
            messageStream.destroy();
        });
        mocha_1.it('should set destroyed to true', () => {
            messageStream.destroy();
            assert.strictEqual(messageStream.destroyed, true);
        });
        mocha_1.it('should stop keeping the streams alive', () => {
            const clock = sandbox.useFakeTimers();
            const frequency = 30000;
            const stubs = client.streams.map(stream => {
                return sandbox.stub(stream, 'write').throws();
            });
            messageStream.destroy();
            clock.tick(frequency * 2); // for good measure
            stubs.forEach(stub => {
                assert.strictEqual(stub.callCount, 0);
            });
        });
        mocha_1.it('should unpipe and cancel all underlying streams', () => {
            const stubs = [
                ...client.streams.map(stream => {
                    return sandbox.stub(stream, 'unpipe').withArgs(messageStream);
                }),
                ...client.streams.map(stream => {
                    return sandbox.stub(stream, 'cancel');
                }),
            ];
            messageStream.destroy();
            stubs.forEach(stub => {
                assert.strictEqual(stub.callCount, 1);
            });
        });
        mocha_1.describe('without native destroy', () => {
            let destroy;
            before(() => {
                destroy = FakePassThrough.prototype.destroy;
                // tslint:disable-next-line no-any
                FakePassThrough.prototype.destroy = false;
            });
            after(() => {
                FakePassThrough.prototype.destroy = destroy;
            });
            mocha_1.it('should emit close', done => {
                messageStream.on('close', done);
                messageStream.destroy();
            });
            mocha_1.it('should emit an error if present', done => {
                const fakeError = new Error('err');
                messageStream.on('error', err => {
                    assert.strictEqual(err, fakeError);
                    done();
                });
                messageStream.destroy(fakeError);
            });
        });
    });
    mocha_1.describe('pull stream lifecycle', () => {
        mocha_1.describe('initialization', () => {
            mocha_1.it('should pipe to the message stream', done => {
                const fakeResponses = [{}, {}, {}, {}, {}];
                const received = [];
                messageStream
                    .on('data', (chunk) => received.push(chunk))
                    .on('end', () => {
                    assert.deepStrictEqual(received, fakeResponses);
                    done();
                });
                client.streams.forEach((stream, i) => stream.push(fakeResponses[i]));
                setImmediate(() => messageStream.end());
            });
            mocha_1.it('should not end the message stream', done => {
                messageStream
                    .on('data', () => { })
                    .on('end', () => {
                    done(new Error('Should not be called.'));
                });
                client.streams.forEach(stream => stream.push(null));
                setImmediate(done);
            });
        });
        mocha_1.describe('on error', () => {
            mocha_1.it('should destroy the stream if unable to get client', done => {
                const fakeError = new Error('err');
                sandbox.stub(subscriber, 'getClient').rejects(fakeError);
                const ms = new MessageStream(subscriber);
                ms.on('error', err => {
                    assert.strictEqual(err, fakeError);
                    assert.strictEqual(ms.destroyed, true);
                    done();
                });
            });
            mocha_1.it('should destroy the stream if unable to connect to channel', done => {
                const stub = sandbox.stub(client, 'waitForReady');
                const ms = new MessageStream(subscriber);
                const fakeError = new Error('err');
                const expectedMessage = `Failed to connect to channel. Reason: err`;
                ms.on('error', (err) => {
                    assert.strictEqual(err.code, 2);
                    assert.strictEqual(err.message, expectedMessage);
                    assert.strictEqual(ms.destroyed, true);
                    done();
                });
                setImmediate(() => {
                    const [, callback] = stub.lastCall.args;
                    callback(fakeError);
                });
            });
            mocha_1.it('should give a deadline error if waitForReady times out', done => {
                const stub = sandbox.stub(client, 'waitForReady');
                const ms = new MessageStream(subscriber);
                const fakeError = new Error('Failed to connect before the deadline');
                ms.on('error', (err) => {
                    assert.strictEqual(err.code, 4);
                    done();
                });
                setImmediate(() => {
                    const [, callback] = stub.lastCall.args;
                    callback(fakeError);
                });
            });
            mocha_1.it('should emit non-status errors', done => {
                const fakeError = new Error('err');
                messageStream.on('error', err => {
                    assert.strictEqual(err, fakeError);
                    done();
                });
                client.streams[0].emit('error', fakeError);
            });
            mocha_1.it('should ignore status errors', done => {
                const [stream] = client.streams;
                const status = { code: 0 };
                messageStream.on('error', done);
                stream.emit('error', status);
                stream.emit('status', status);
                setImmediate(done);
            });
            mocha_1.it('should ignore errors that come in after the status', done => {
                const [stream] = client.streams;
                messageStream.on('error', done);
                stream.emit('status', { code: 0 });
                stream.emit('error', { code: 2 });
                setImmediate(done);
            });
        });
        mocha_1.describe('on status', () => {
            mocha_1.it('should wait for end to fire before creating a new stream', done => {
                const [stream] = client.streams;
                const expectedCount = stream.listenerCount('end') + 1;
                messageStream.on('error', done);
                stream.emit('status', { code: 2 });
                assert.strictEqual(stream.listenerCount('end'), expectedCount);
                stream.push(null);
                setImmediate(() => {
                    assert.strictEqual(client.streams.length, 5);
                    done();
                });
            });
            mocha_1.it('should create a new stream if stream already ended', done => {
                const [stream] = client.streams;
                messageStream.on('error', done);
                stream.push(null);
                setImmediate(() => {
                    const count = stream.listenerCount('end');
                    stream.emit('status', { code: 2 });
                    assert.strictEqual(stream.listenerCount('end'), count);
                    setImmediate(() => {
                        assert.strictEqual(client.streams.length, 5);
                        done();
                    });
                });
            });
            mocha_1.it('should destroy the msg stream if status is not retryable', done => {
                const fakeStatus = {
                    code: 5,
                    details: 'Err',
                };
                messageStream.on('error', (err) => {
                    assert(err instanceof Error);
                    assert.strictEqual(err.code, fakeStatus.code);
                    assert.strictEqual(err.message, fakeStatus.details);
                    assert.strictEqual(messageStream.destroyed, true);
                    done();
                });
                client.streams.forEach(stream => {
                    stream.emit('status', fakeStatus);
                    stream.push(null);
                });
            });
        });
        mocha_1.describe('keeping streams alive', () => {
            let clock;
            before(() => {
                clock = sandbox.useFakeTimers();
            });
            mocha_1.it('should keep the streams alive', () => {
                const frequency = 30000;
                const stubs = client.streams.map(stream => {
                    return sandbox.stub(stream, 'write');
                });
                clock.tick(frequency * 1.5);
                stubs.forEach(stub => {
                    const [data] = stub.lastCall.args;
                    assert.deepStrictEqual(data, {});
                });
            });
        });
    });
});
//# sourceMappingURL=message-stream.js.map