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
const pfy = require("@google-cloud/promisify");
const assert = require("assert");
const mocha_1 = require("mocha");
const events_1 = require("events");
const proxyquire = require("proxyquire");
const sinon = require("sinon");
let promisified = false;
const fakePromisify = Object.assign({}, pfy, {
    promisifyAll: (ctor, options) => {
        if (ctor.name !== 'Publisher') {
            return;
        }
        promisified = true;
        assert.ok(options.singular);
        assert.deepStrictEqual(options.exclude, ['publish', 'setOptions']);
    },
});
class FakeQueue extends events_1.EventEmitter {
    constructor(publisher) {
        super();
        this.publisher = publisher;
    }
    add(message, callback) { }
}
class FakeOrderedQueue extends FakeQueue {
    constructor(publisher, key) {
        super(publisher);
        this.orderingKey = key;
    }
    resumePublishing() { }
}
mocha_1.describe('Publisher', () => {
    const sandbox = sinon.createSandbox();
    const topic = {};
    // tslint:disable-next-line variable-name
    let Publisher;
    let publisher;
    before(() => {
        const mocked = proxyquire('../../src/publisher/index.js', {
            '@google-cloud/promisify': fakePromisify,
            './message-queues': {
                Queue: FakeQueue,
                OrderedQueue: FakeOrderedQueue,
            },
        });
        Publisher = mocked.Publisher;
    });
    beforeEach(() => {
        publisher = new Publisher(topic);
    });
    afterEach(() => {
        sandbox.restore();
    });
    mocha_1.describe('initialization', () => {
        mocha_1.it('should promisify all the things', () => {
            assert(promisified);
        });
        mocha_1.it('should localize Promise class if set', () => {
            const t = { Promise };
            publisher = new Publisher(t);
            assert.strictEqual(publisher.Promise, Promise);
        });
        mocha_1.it('should capture user options', () => {
            const stub = sandbox.stub(Publisher.prototype, 'setOptions');
            const options = {};
            publisher = new Publisher(topic, options);
            assert.ok(stub.calledWith(options));
        });
        mocha_1.it('should localize topic instance', () => {
            assert.strictEqual(publisher.topic, topic);
        });
        mocha_1.it('should create a message queue', () => {
            assert(publisher.queue instanceof FakeQueue);
            assert.strictEqual(publisher.queue.publisher, publisher);
        });
        mocha_1.it('should create a map for ordered queues', () => {
            assert(publisher.orderedQueues instanceof Map);
        });
    });
    mocha_1.describe('publish', () => {
        const buffer = Buffer.from('Hello, world!');
        const spy = sandbox.spy();
        mocha_1.it('should call through to publishMessage', () => {
            const stub = sandbox.stub(publisher, 'publishMessage');
            publisher.publish(buffer, spy);
            const [{ data }, callback] = stub.lastCall.args;
            assert.strictEqual(data, buffer);
            assert.strictEqual(callback, spy);
        });
        mocha_1.it('should optionally accept attributes', () => {
            const stub = sandbox.stub(publisher, 'publishMessage');
            const attrs = {};
            publisher.publish(buffer, attrs, spy);
            const [{ attributes }, callback] = stub.lastCall.args;
            assert.strictEqual(attributes, attrs);
            assert.strictEqual(callback, spy);
        });
    });
    mocha_1.describe('publishMessage', () => {
        const data = Buffer.from('hello, world!');
        const spy = sandbox.spy();
        mocha_1.it('should throw an error if data is not a Buffer', () => {
            const badData = {};
            assert.throws(() => publisher.publishMessage({ data: badData }, spy), /Data must be in the form of a Buffer\./);
        });
        mocha_1.it('should throw an error if attributes are wrong format', () => {
            const attributes = { foo: { bar: 'baz' } };
            assert.throws(() => publisher.publishMessage({ data, attributes }, spy), /All attributes must be in the form of a string.\n\nInvalid value of type "object" provided for "foo"\./);
        });
        mocha_1.it('should add non-ordered messages to the message queue', () => {
            const stub = sandbox.stub(publisher.queue, 'add');
            const fakeMessage = { data };
            publisher.publishMessage(fakeMessage, spy);
            const [message, callback] = stub.lastCall.args;
            assert.strictEqual(message, fakeMessage);
            assert.strictEqual(callback, spy);
        });
        mocha_1.describe('ordered messages', () => {
            const orderingKey = 'foo';
            const fakeMessage = { data, orderingKey };
            let queue;
            beforeEach(() => {
                queue = new FakeOrderedQueue(publisher, orderingKey);
                publisher.orderedQueues.set(orderingKey, queue);
            });
            mocha_1.it('should create a new queue for a message if need be', () => {
                publisher.orderedQueues.clear();
                publisher.publishMessage(fakeMessage, spy);
                queue = publisher.orderedQueues.get(orderingKey);
                assert(queue instanceof FakeOrderedQueue);
                assert.strictEqual(queue.publisher, publisher);
                assert.strictEqual(queue.orderingKey, orderingKey);
            });
            mocha_1.it('should add the ordered message to the correct queue', () => {
                const stub = sandbox.stub(queue, 'add');
                publisher.publishMessage(fakeMessage, spy);
                const [message, callback] = stub.lastCall.args;
                assert.strictEqual(message, fakeMessage);
                assert.strictEqual(callback, spy);
            });
            mocha_1.it('should return an error if the queue encountered an error', done => {
                const error = new Error('err');
                sandbox
                    .stub(queue, 'add')
                    .callsFake((message, callback) => callback(error));
                publisher.publishMessage(fakeMessage, err => {
                    assert.strictEqual(err, error);
                    done();
                });
            });
            mocha_1.it('should delete the queue once it is empty', () => {
                publisher.orderedQueues.clear();
                publisher.publishMessage(fakeMessage, spy);
                queue = publisher.orderedQueues.get(orderingKey);
                queue.emit('drain');
                assert.strictEqual(publisher.orderedQueues.size, 0);
            });
        });
    });
    mocha_1.describe('resumePublishing', () => {
        mocha_1.it('should resume publishing for the provided ordering key', () => {
            const orderingKey = 'foo';
            const queue = new FakeOrderedQueue(publisher, orderingKey);
            const stub = sandbox.stub(queue, 'resumePublishing');
            publisher.orderedQueues.set(orderingKey, queue);
            publisher.resumePublishing(orderingKey);
            assert.strictEqual(stub.callCount, 1);
        });
    });
    mocha_1.describe('setOptions', () => {
        mocha_1.it('should apply default values', () => {
            publisher.setOptions({});
            assert.deepStrictEqual(publisher.settings, {
                batching: {
                    maxBytes: Math.pow(1024, 2) * 5,
                    maxMessages: 1000,
                    maxMilliseconds: 100,
                },
                messageOrdering: false,
                gaxOpts: {
                    isBundling: false,
                },
            });
        });
        mocha_1.it('should capture user provided values', () => {
            const options = {
                batching: {
                    maxBytes: 10,
                    maxMessages: 10,
                    maxMilliseconds: 1,
                },
                messageOrdering: true,
                gaxOpts: {
                    isBundling: true,
                },
            };
            publisher.setOptions(options);
            assert.deepStrictEqual(publisher.settings, options);
        });
        mocha_1.it('should cap maxBytes at 9MB', () => {
            publisher.setOptions({
                batching: {
                    maxBytes: Math.pow(1024, 2) * 10,
                },
            });
            const expected = Math.pow(1024, 2) * 9;
            assert.strictEqual(publisher.settings.batching.maxBytes, expected);
        });
        mocha_1.it('should cap maxMessages at 1000', () => {
            publisher.setOptions({
                batching: {
                    maxMessages: 1001,
                },
            });
            const expected = 1000;
            assert.strictEqual(publisher.settings.batching.maxMessages, 1000);
        });
    });
});
//# sourceMappingURL=index.js.map