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
const events_1 = require("events");
const proxyquire = require("proxyquire");
const sinon = require("sinon");
const stream_1 = require("stream");
const uuid = require("uuid");
const stubs = new Map();
class FakeClient {
}
class FakePubSub {
    constructor() {
        this.client = new FakeClient();
    }
    getClient_(options, callback) {
        callback(null, this.client);
    }
}
class FakeSubscription {
    constructor() {
        this.name = uuid.v4();
        this.projectId = uuid.v4();
        this.pubsub = new FakePubSub();
    }
}
class FakeHistogram {
    constructor(options) {
        this.options = options;
        const key = options ? 'histogram' : 'latencies';
        stubs.set(key, this);
    }
    add(seconds) { }
    percentile(percentile) {
        return 10;
    }
}
class FakeLeaseManager extends events_1.EventEmitter {
    constructor(sub, options) {
        super();
        this.options = options;
        stubs.set('inventory', this);
    }
    add(message) { }
    clear() { }
    remove(message) { }
}
class FakeQueue {
    constructor(sub, options) {
        this.numPendingRequests = 0;
        this.maxMilliseconds = 100;
        this.options = options;
    }
    add(message, deadline) { }
    async flush() { }
    async onFlush() { }
}
class FakeAckQueue extends FakeQueue {
    constructor(sub, options) {
        super(sub, options);
        stubs.set('ackQueue', this);
    }
}
class FakeModAckQueue extends FakeQueue {
    constructor(sub, options) {
        super(sub, options);
        stubs.set('modAckQueue', this);
    }
}
class FakeMessageStream extends stream_1.PassThrough {
    constructor(sub, options) {
        super({ objectMode: true });
        this.options = options;
        stubs.set('messageStream', this);
    }
    destroy(error) { }
}
class FakePreciseDate {
    constructor(date) {
        this.value = date;
    }
}
const RECEIVED_MESSAGE = {
    ackId: uuid.v4(),
    message: {
        attributes: {},
        data: Buffer.from('Hello, world!'),
        messageId: uuid.v4(),
        orderingKey: 'ordering-key',
        publishTime: { seconds: 12, nanos: 32 },
    },
};
mocha_1.describe('Subscriber', () => {
    const sandbox = sinon.createSandbox();
    const fakeProjectify = { replaceProjectIdToken: sandbox.stub() };
    let subscription;
    // tslint:disable-next-line variable-name
    let Message;
    let message;
    // tslint:disable-next-line variable-name
    let Subscriber;
    let subscriber;
    before(() => {
        const s = proxyquire('../src/subscriber.js', {
            '@google-cloud/precise-date': { PreciseDate: FakePreciseDate },
            '@google-cloud/projectify': fakeProjectify,
            './histogram': { Histogram: FakeHistogram },
            './lease-manager': { LeaseManager: FakeLeaseManager },
            './message-queues': {
                AckQueue: FakeAckQueue,
                ModAckQueue: FakeModAckQueue,
            },
            './message-stream': { MessageStream: FakeMessageStream },
        });
        Message = s.Message;
        Subscriber = s.Subscriber;
    });
    beforeEach(() => {
        subscription = new FakeSubscription();
        subscriber = new Subscriber(subscription);
        message = new Message(subscriber, RECEIVED_MESSAGE);
        subscriber.open();
    });
    afterEach(() => {
        sandbox.restore();
        subscriber.close();
    });
    mocha_1.describe('initialization', () => {
        mocha_1.it('should default ackDeadline to 10', () => {
            assert.strictEqual(subscriber.ackDeadline, 10);
        });
        mocha_1.it('should set isOpen to false', () => {
            const s = new Subscriber(subscription);
            assert.strictEqual(s.isOpen, false);
        });
        mocha_1.it('should set any options passed in', () => {
            const stub = sandbox.stub(Subscriber.prototype, 'setOptions');
            const fakeOptions = {};
            const sub = new Subscriber(subscription, fakeOptions);
            const [options] = stub.lastCall.args;
            assert.strictEqual(options, fakeOptions);
        });
    });
    mocha_1.describe('modAckLatency', () => {
        mocha_1.it('should get the 99th percentile latency', () => {
            const latencies = stubs.get('latencies');
            const fakeLatency = 234;
            sandbox
                .stub(latencies, 'percentile')
                .withArgs(99)
                .returns(fakeLatency);
            const maxMilliseconds = stubs.get('modAckQueue').maxMilliseconds;
            const expectedLatency = fakeLatency * 1000 + maxMilliseconds;
            assert.strictEqual(subscriber.modAckLatency, expectedLatency);
        });
    });
    mocha_1.describe('name', () => {
        mocha_1.it('should replace the project id token', () => {
            const fakeName = 'abcd';
            fakeProjectify.replaceProjectIdToken
                .withArgs(subscription.name, subscription.projectId)
                .returns(fakeName);
            const name = subscriber.name;
            assert.strictEqual(name, fakeName);
        });
        mocha_1.it('should cache the name', () => {
            const fakeName = 'abcd';
            const stub = fakeProjectify.replaceProjectIdToken
                .withArgs(subscription.name, subscription.projectId)
                .returns(fakeName);
            const name = subscriber.name;
            assert.strictEqual(name, fakeName);
            const name2 = subscriber.name;
            assert.strictEqual(name, name2);
            assert.strictEqual(stub.callCount, 1);
        });
    });
    mocha_1.describe('ack', () => {
        mocha_1.it('should update the ack histogram/deadline', () => {
            const histogram = stubs.get('histogram');
            const now = Date.now();
            message.received = 23842328;
            sandbox.stub(global.Date, 'now').returns(now);
            const expectedSeconds = (now - message.received) / 1000;
            const addStub = sandbox.stub(histogram, 'add').withArgs(expectedSeconds);
            const fakeDeadline = 312123;
            sandbox
                .stub(histogram, 'percentile')
                .withArgs(99)
                .returns(fakeDeadline);
            subscriber.ack(message);
            assert.strictEqual(addStub.callCount, 1);
            assert.strictEqual(subscriber.ackDeadline, fakeDeadline);
        });
        mocha_1.it('should not update the deadline if user specified', () => {
            const histogram = stubs.get('histogram');
            const ackDeadline = 543;
            sandbox.stub(histogram, 'add').throws();
            sandbox.stub(histogram, 'percentile').throws();
            subscriber.setOptions({ ackDeadline });
            subscriber.ack(message);
            assert.strictEqual(subscriber.ackDeadline, ackDeadline);
        });
        mocha_1.it('should add the message to the ack queue', () => {
            const ackQueue = stubs.get('ackQueue');
            const stub = sandbox.stub(ackQueue, 'add').withArgs(message);
            subscriber.ack(message);
            assert.strictEqual(stub.callCount, 1);
        });
        mocha_1.it('should remove the message from inv. after queue flushes', done => {
            const ackQueue = stubs.get('ackQueue');
            const inventory = stubs.get('inventory');
            const onFlushStub = sandbox.stub(ackQueue, 'onFlush').resolves();
            sandbox
                .stub(inventory, 'remove')
                .withArgs(message)
                .callsFake(() => {
                assert.strictEqual(onFlushStub.callCount, 1);
                done();
            });
            subscriber.ack(message);
        });
    });
    mocha_1.describe('close', () => {
        mocha_1.it('should noop if not open', () => {
            const s = new Subscriber(subscription);
            const stream = stubs.get('messageStream');
            sandbox
                .stub(stream, 'destroy')
                .rejects(new Error('should not be called.'));
            return s.close();
        });
        mocha_1.it('should set isOpen to false', () => {
            subscriber.close();
            assert.strictEqual(subscriber.isOpen, false);
        });
        mocha_1.it('should destroy the message stream', () => {
            const stream = stubs.get('messageStream');
            const stub = sandbox.stub(stream, 'destroy');
            subscriber.close();
            assert.strictEqual(stub.callCount, 1);
        });
        mocha_1.it('should clear the inventory', () => {
            const inventory = stubs.get('inventory');
            const stub = sandbox.stub(inventory, 'clear');
            subscriber.close();
            assert.strictEqual(stub.callCount, 1);
        });
        mocha_1.it('should emit a close event', done => {
            subscriber.on('close', done);
            subscriber.close();
        });
        mocha_1.it('should nack any messages that come in after', () => {
            const stream = stubs.get('messageStream');
            const stub = sandbox.stub(subscriber, 'nack');
            const pullResponse = { receivedMessages: [RECEIVED_MESSAGE] };
            subscriber.close();
            stream.emit('data', pullResponse);
            const [{ ackId }] = stub.lastCall.args;
            assert.strictEqual(ackId, RECEIVED_MESSAGE.ackId);
        });
        mocha_1.describe('flushing the queues', () => {
            mocha_1.it('should wait for any pending acks', async () => {
                const ackQueue = stubs.get('ackQueue');
                const ackOnFlush = sandbox.stub(ackQueue, 'onFlush').resolves();
                const acksFlush = sandbox.stub(ackQueue, 'flush').resolves();
                ackQueue.numPendingRequests = 1;
                await subscriber.close();
                assert.strictEqual(ackOnFlush.callCount, 1);
                assert.strictEqual(acksFlush.callCount, 1);
            });
            mocha_1.it('should wait for any pending modAcks', async () => {
                const modAckQueue = stubs.get('modAckQueue');
                const modAckOnFlush = sandbox.stub(modAckQueue, 'onFlush').resolves();
                const modAckFlush = sandbox.stub(modAckQueue, 'flush').resolves();
                modAckQueue.numPendingRequests = 1;
                await subscriber.close();
                assert.strictEqual(modAckOnFlush.callCount, 1);
                assert.strictEqual(modAckFlush.callCount, 1);
            });
            mocha_1.it('should resolve if no messages are pending', () => {
                const ackQueue = stubs.get('ackQueue');
                sandbox.stub(ackQueue, 'flush').rejects();
                sandbox.stub(ackQueue, 'onFlush').rejects();
                const modAckQueue = stubs.get('modAckQueue');
                sandbox.stub(modAckQueue, 'flush').rejects();
                sandbox.stub(modAckQueue, 'onFlush').rejects();
                return subscriber.close();
            });
        });
    });
    mocha_1.describe('getClient', () => {
        mocha_1.it('should get a subscriber client', async () => {
            const pubsub = subscription.pubsub;
            const spy = sandbox.spy(pubsub, 'getClient_');
            const client = await subscriber.getClient();
            const [options] = spy.lastCall.args;
            assert.deepStrictEqual(options, { client: 'SubscriberClient' });
            assert.strictEqual(client, pubsub.client);
        });
    });
    mocha_1.describe('modAck', () => {
        const deadline = 600;
        mocha_1.it('should add the message/deadline to the modAck queue', () => {
            const modAckQueue = stubs.get('modAckQueue');
            const stub = sandbox.stub(modAckQueue, 'add').withArgs(message, deadline);
            subscriber.modAck(message, deadline);
            assert.strictEqual(stub.callCount, 1);
        });
        mocha_1.it('should capture latency after queue flush', async () => {
            const modAckQueue = stubs.get('modAckQueue');
            const latencies = stubs.get('latencies');
            const start = 1232123;
            const end = 34838243;
            const expectedSeconds = (end - start) / 1000;
            const dateStub = sandbox.stub(global.Date, 'now');
            dateStub.onCall(0).returns(start);
            dateStub.onCall(1).returns(end);
            sandbox.stub(modAckQueue, 'onFlush').resolves();
            const addStub = sandbox.stub(latencies, 'add').withArgs(expectedSeconds);
            await subscriber.modAck(message, deadline);
            assert.strictEqual(addStub.callCount, 1);
        });
    });
    mocha_1.describe('nack', () => {
        mocha_1.it('should modAck the message with a 0 deadline', async () => {
            const stub = sandbox.stub(subscriber, 'modAck');
            await subscriber.nack(message);
            const [msg, deadline] = stub.lastCall.args;
            assert.strictEqual(msg, message);
            assert.strictEqual(deadline, 0);
        });
        mocha_1.it('should remove the message from the inventory', async () => {
            const inventory = stubs.get('inventory');
            const stub = sandbox.stub(inventory, 'remove').withArgs(message);
            await subscriber.nack(message);
            assert.strictEqual(stub.callCount, 1);
        });
    });
    mocha_1.describe('open', () => {
        beforeEach(() => subscriber.close());
        mocha_1.it('should pass in batching options', () => {
            const batching = { maxMessages: 100 };
            subscriber.setOptions({ batching });
            subscriber.open();
            const ackQueue = stubs.get('ackQueue');
            const modAckQueue = stubs.get('modAckQueue');
            assert.strictEqual(ackQueue.options, batching);
            assert.strictEqual(modAckQueue.options, batching);
        });
        mocha_1.it('should pass in flow control options', () => {
            const flowControl = { maxMessages: 100 };
            subscriber.setOptions({ flowControl });
            subscriber.open();
            const inventory = stubs.get('inventory');
            assert.strictEqual(inventory.options, flowControl);
        });
        mocha_1.it('should pass in streaming options', () => {
            const streamingOptions = { maxStreams: 3 };
            subscriber.setOptions({ streamingOptions });
            subscriber.open();
            const stream = stubs.get('messageStream');
            assert.strictEqual(stream.options, streamingOptions);
        });
        mocha_1.it('should emit stream errors', done => {
            subscriber.open();
            const stream = stubs.get('messageStream');
            const fakeError = new Error('err');
            subscriber.on('error', err => {
                assert.strictEqual(err, fakeError);
                done();
            });
            stream.emit('error', fakeError);
        });
        mocha_1.it('should close the subscriber if stream closes unexpectedly', () => {
            const stub = sandbox.stub(subscriber, 'close');
            const stream = stubs.get('messageStream');
            stream.emit('close');
            assert.strictEqual(stub.callCount, 1);
        });
        mocha_1.it('should add messages to the inventory', done => {
            subscriber.open();
            const modAckStub = sandbox.stub(subscriber, 'modAck');
            const stream = stubs.get('messageStream');
            const pullResponse = { receivedMessages: [RECEIVED_MESSAGE] };
            const inventory = stubs.get('inventory');
            const addStub = sandbox.stub(inventory, 'add').callsFake(() => {
                const [addMsg] = addStub.lastCall.args;
                assert.deepStrictEqual(addMsg, message);
                // test for receipt
                const [modAckMsg, deadline] = modAckStub.lastCall.args;
                assert.strictEqual(addMsg, modAckMsg);
                assert.strictEqual(deadline, subscriber.ackDeadline);
                done();
            });
            sandbox.stub(global.Date, 'now').returns(message.received);
            stream.emit('data', pullResponse);
        });
        mocha_1.it('should pause the stream when full', () => {
            const inventory = stubs.get('inventory');
            const stream = stubs.get('messageStream');
            const pauseStub = sandbox.stub(stream, 'pause');
            inventory.emit('full');
            assert.strictEqual(pauseStub.callCount, 1);
        });
        mocha_1.it('should resume the stream when not full', () => {
            const inventory = stubs.get('inventory');
            const stream = stubs.get('messageStream');
            const resumeStub = sandbox.stub(stream, 'resume');
            inventory.emit('free');
            assert.strictEqual(resumeStub.callCount, 1);
        });
        mocha_1.it('should set isOpen to false', () => {
            subscriber.open();
            assert.strictEqual(subscriber.isOpen, true);
        });
    });
    mocha_1.describe('setOptions', () => {
        beforeEach(() => subscriber.close());
        mocha_1.it('should capture the ackDeadline', () => {
            const ackDeadline = 1232;
            subscriber.setOptions({ ackDeadline });
            assert.strictEqual(subscriber.ackDeadline, ackDeadline);
        });
        mocha_1.it('should not set maxStreams higher than maxMessages', () => {
            const maxMessages = 3;
            const flowControl = { maxMessages };
            subscriber.setOptions({ flowControl });
            subscriber.open();
            const stream = stubs.get('messageStream');
            assert.strictEqual(stream.options.maxStreams, maxMessages);
        });
    });
    mocha_1.describe('Message', () => {
        mocha_1.describe('initialization', () => {
            mocha_1.it('should localize ackId', () => {
                assert.strictEqual(message.ackId, RECEIVED_MESSAGE.ackId);
            });
            mocha_1.it('should localize attributes', () => {
                assert.strictEqual(message.attributes, RECEIVED_MESSAGE.message.attributes);
            });
            mocha_1.it('should localize data', () => {
                assert.strictEqual(message.data, RECEIVED_MESSAGE.message.data);
            });
            mocha_1.it('should localize id', () => {
                assert.strictEqual(message.id, RECEIVED_MESSAGE.message.messageId);
            });
            mocha_1.it('should localize orderingKey', () => {
                assert.strictEqual(message.orderingKey, RECEIVED_MESSAGE.message.orderingKey);
            });
            mocha_1.it('should localize publishTime', () => {
                const m = new Message(subscriber, RECEIVED_MESSAGE);
                const timestamp = m.publishTime;
                assert(timestamp instanceof FakePreciseDate);
                assert.strictEqual(timestamp.value, RECEIVED_MESSAGE.message.publishTime);
            });
            mocha_1.it('should localize received time', () => {
                const now = Date.now();
                sandbox.stub(global.Date, 'now').returns(now);
                const m = new Message(subscriber, RECEIVED_MESSAGE);
                assert.strictEqual(m.received, now);
            });
        });
        mocha_1.describe('deliveryAttempt', () => {
            mocha_1.it('should store the delivery attempt', () => {
                const deliveryAttempt = 10;
                const message = Object.assign({ deliveryAttempt }, RECEIVED_MESSAGE);
                const m = new Message(subscriber, message);
                const attempt = m.deliveryAttempt;
                assert.strictEqual(attempt, deliveryAttempt);
            });
            mocha_1.it('should default to 0', () => {
                const m = new Message(subscriber, RECEIVED_MESSAGE);
                const attempt = m.deliveryAttempt;
                assert.strictEqual(attempt, 0);
            });
        });
        mocha_1.describe('length', () => {
            mocha_1.it('should return the data length', () => {
                assert.strictEqual(message.length, message.data.length);
            });
            mocha_1.it('should preserve the original data lenght', () => {
                const originalLength = message.data.length;
                message.data = Buffer.from('ohno');
                assert.notStrictEqual(message.length, message.data.length);
                assert.strictEqual(message.length, originalLength);
            });
        });
        mocha_1.describe('ack', () => {
            mocha_1.it('should ack the message', () => {
                const stub = sandbox.stub(subscriber, 'ack');
                message.ack();
                const [msg] = stub.lastCall.args;
                assert.strictEqual(msg, message);
            });
            mocha_1.it('should not ack the message if its been handled', () => {
                const stub = sandbox.stub(subscriber, 'ack');
                message.nack();
                message.ack();
                assert.strictEqual(stub.callCount, 0);
            });
        });
        mocha_1.describe('modAck', () => {
            mocha_1.it('should modAck the message', () => {
                const fakeDeadline = 10;
                const stub = sandbox.stub(subscriber, 'modAck');
                message.modAck(fakeDeadline);
                const [msg, deadline] = stub.lastCall.args;
                assert.strictEqual(msg, message);
                assert.strictEqual(deadline, fakeDeadline);
            });
            mocha_1.it('should not modAck the message if its been handled', () => {
                const deadline = 10;
                const stub = sandbox.stub(subscriber, 'modAck');
                message.ack();
                message.modAck(deadline);
                assert.strictEqual(stub.callCount, 0);
            });
        });
        mocha_1.describe('nack', () => {
            mocha_1.it('should nack the message', () => {
                const stub = sandbox.stub(subscriber, 'modAck');
                message.nack();
                const [msg, delay] = stub.lastCall.args;
                assert.strictEqual(msg, message);
                assert.strictEqual(delay, 0);
            });
            mocha_1.it('should not nack the message if its been handled', () => {
                const stub = sandbox.stub(subscriber, 'modAck');
                message.ack();
                message.nack();
                assert.strictEqual(stub.callCount, 0);
            });
        });
    });
});
//# sourceMappingURL=subscriber.js.map