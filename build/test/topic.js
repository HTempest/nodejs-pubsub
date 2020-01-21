"use strict";
// Copyright 2014 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
Object.defineProperty(exports, "__esModule", { value: true });
const pfy = require("@google-cloud/promisify");
const assert = require("assert");
const mocha_1 = require("mocha");
const proxyquire = require("proxyquire");
const sinon = require("sinon");
const util = require("../src/util");
let promisified = false;
const fakePromisify = Object.assign({}, pfy, {
    promisifyAll: (klass, options) => {
        if (klass.name !== 'Topic') {
            return;
        }
        promisified = true;
        assert.deepStrictEqual(options.exclude, [
            'publish',
            'publishJSON',
            'publishMessage',
            'setPublishOptions',
            'subscription',
        ]);
    },
});
class FakeIAM {
    constructor(...args) {
        this.calledWith_ = args;
    }
}
class FakePublisher {
    constructor(...args) {
        this.calledWith_ = args;
    }
    publishMessage(...args) {
        this.published_ = args;
    }
    setOptions(options) {
        this.options_ = options;
    }
}
let extended = false;
const fakePaginator = {
    extend(klass, methods) {
        if (klass.name !== 'Topic') {
            return;
        }
        assert.deepStrictEqual(methods, ['getSubscriptions']);
        extended = true;
    },
    streamify(methodName) {
        return methodName;
    },
};
mocha_1.describe('Topic', () => {
    // tslint:disable-next-line no-any variable-name
    let Topic;
    // tslint:disable-next-line no-any
    let topic;
    const PROJECT_ID = 'test-project';
    const TOPIC_NAME = 'projects/' + PROJECT_ID + '/topics/test-topic';
    const TOPIC_UNFORMATTED_NAME = TOPIC_NAME.split('/').pop();
    // tslint:disable-next-line no-any
    const PUBSUB = {
        Promise: {},
        projectId: PROJECT_ID,
        createTopic: util.noop,
        request: util.noop,
    };
    before(() => {
        Topic = proxyquire('../src/topic.js', {
            '@google-cloud/promisify': fakePromisify,
            '@google-cloud/paginator': {
                paginator: fakePaginator,
            },
            './iam': { IAM: FakeIAM },
            './publisher': { Publisher: FakePublisher },
        }).Topic;
    });
    const sandbox = sinon.createSandbox();
    beforeEach(() => {
        topic = new Topic(PUBSUB, TOPIC_NAME);
        topic.parent = PUBSUB;
    });
    afterEach(() => sandbox.restore());
    mocha_1.describe('initialization', () => {
        mocha_1.it('should extend the correct methods', () => {
            assert(extended); // See `fakePaginator.extend`
        });
        mocha_1.it('should streamify the correct methods', () => {
            assert.strictEqual(topic.getSubscriptionsStream, 'getSubscriptions');
        });
        mocha_1.it('should promisify all the things', () => {
            assert(promisified);
        });
        mocha_1.it('should localize pubsub.Promise', () => {
            assert.strictEqual(topic.Promise, PUBSUB.Promise);
        });
        mocha_1.it('should format the name', () => {
            const formattedName = 'a/b/c/d';
            const formatName_ = Topic.formatName_;
            Topic.formatName_ = (projectId, name) => {
                assert.strictEqual(projectId, PROJECT_ID);
                assert.strictEqual(name, TOPIC_NAME);
                Topic.formatName_ = formatName_;
                return formattedName;
            };
            const topic = new Topic(PUBSUB, TOPIC_NAME);
            assert.strictEqual(topic.name, formattedName);
        });
        mocha_1.it('should create a publisher', () => {
            const fakeOptions = {};
            const topic = new Topic(PUBSUB, TOPIC_NAME, fakeOptions);
            const [t, options] = topic.publisher.calledWith_;
            assert.strictEqual(t, topic);
            assert.strictEqual(options, fakeOptions);
        });
        mocha_1.it('should localize the parent object', () => {
            assert.strictEqual(topic.parent, PUBSUB);
            assert.strictEqual(topic.pubsub, PUBSUB);
        });
        mocha_1.it('should localize the request function', done => {
            PUBSUB.request = () => {
                done();
            };
            const topic = new Topic(PUBSUB, TOPIC_NAME);
            topic.request(assert.ifError);
        });
        mocha_1.it('should create an iam object', () => {
            assert.deepStrictEqual(topic.iam.calledWith_, [PUBSUB, TOPIC_NAME]);
        });
    });
    mocha_1.describe('formatName_', () => {
        mocha_1.it('should format name', () => {
            const formattedName = Topic.formatName_(PROJECT_ID, TOPIC_UNFORMATTED_NAME);
            assert.strictEqual(formattedName, TOPIC_NAME);
        });
        mocha_1.it('should format name when given a complete name', () => {
            const formattedName = Topic.formatName_(PROJECT_ID, TOPIC_NAME);
            assert.strictEqual(formattedName, TOPIC_NAME);
        });
    });
    mocha_1.describe('create', () => {
        mocha_1.it('should call the parent createTopic method', done => {
            const options_ = {};
            PUBSUB.createTopic = (name, options) => {
                assert.strictEqual(name, topic.name);
                assert.strictEqual(options, options_);
                done();
            };
            topic.create(options_, assert.ifError);
        });
    });
    mocha_1.describe('createSubscription', () => {
        mocha_1.it('should call the parent createSubscription method', done => {
            const NAME = 'sub-name';
            const OPTIONS = { a: 'a' };
            PUBSUB.createSubscription = (topic_, name, options) => {
                assert.strictEqual(topic_, topic);
                assert.strictEqual(name, NAME);
                assert.strictEqual(options, OPTIONS);
                done();
            };
            topic.createSubscription(NAME, OPTIONS, assert.ifError);
        });
    });
    mocha_1.describe('delete', () => {
        mocha_1.it('should make the proper request', done => {
            topic.request = (config) => {
                assert.strictEqual(config.client, 'PublisherClient');
                assert.strictEqual(config.method, 'deleteTopic');
                assert.deepStrictEqual(config.reqOpts, { topic: topic.name });
                done();
            };
            topic.delete(assert.ifError);
        });
        mocha_1.it('should optionally accept gax options', done => {
            const options = {};
            topic.request = (config) => {
                assert.strictEqual(config.gaxOpts, options);
                done();
            };
            topic.delete(options, assert.ifError);
        });
    });
    mocha_1.describe('get', () => {
        mocha_1.it('should delete the autoCreate option', done => {
            const options = {
                autoCreate: true,
                a: 'a',
            };
            topic.getMetadata = (gaxOpts) => {
                assert.strictEqual(gaxOpts, options);
                // tslint:disable-next-line no-any
                assert.strictEqual(gaxOpts.autoCreate, undefined);
                done();
            };
            topic.get(options, assert.ifError);
        });
        mocha_1.describe('success', () => {
            const fakeMetadata = {};
            beforeEach(() => {
                topic.getMetadata = (gaxOpts, callback) => {
                    callback(null, fakeMetadata);
                };
            });
            mocha_1.it('should call through to getMetadata', done => {
                topic.get((err, _topic, resp) => {
                    assert.ifError(err);
                    assert.strictEqual(_topic, topic);
                    assert.strictEqual(resp, fakeMetadata);
                    done();
                });
            });
            mocha_1.it('should optionally accept options', done => {
                const options = {};
                topic.getMetadata = (gaxOpts) => {
                    assert.strictEqual(gaxOpts, options);
                    done();
                };
                topic.get(options, assert.ifError);
            });
        });
        mocha_1.describe('error', () => {
            mocha_1.it('should pass back errors when not auto-creating', done => {
                const error = { code: 4 };
                const apiResponse = {};
                topic.getMetadata = (gaxOpts, callback) => {
                    callback(error, apiResponse);
                };
                topic.get((err, _topic, resp) => {
                    assert.strictEqual(err, error);
                    assert.strictEqual(_topic, null);
                    assert.strictEqual(resp, apiResponse);
                    done();
                });
            });
            mocha_1.it('should pass back 404 errors if autoCreate is false', done => {
                const error = { code: 5 };
                const apiResponse = {};
                topic.getMetadata = (gaxOpts, callback) => {
                    callback(error, apiResponse);
                };
                topic.get((err, _topic, resp) => {
                    assert.strictEqual(err, error);
                    assert.strictEqual(_topic, null);
                    assert.strictEqual(resp, apiResponse);
                    done();
                });
            });
            mocha_1.it('should create the topic if 404 + autoCreate is true', done => {
                const error = { code: 5 };
                const apiResponse = {};
                const fakeOptions = {
                    autoCreate: true,
                };
                topic.getMetadata = (gaxOpts, callback) => {
                    callback(error, apiResponse);
                };
                topic.create = (options) => {
                    assert.strictEqual(options, fakeOptions);
                    done();
                };
                topic.get(fakeOptions, assert.ifError);
            });
        });
    });
    mocha_1.describe('exists', () => {
        mocha_1.it('should return true if it finds metadata', done => {
            topic.getMetadata = (callback) => {
                callback(null, {});
            };
            topic.exists((err, exists) => {
                assert.ifError(err);
                assert(exists);
                done();
            });
        });
        mocha_1.it('should return false if a not found error occurs', done => {
            const error = { code: 5 };
            topic.getMetadata = (callback) => {
                callback(error);
            };
            topic.exists((err, exists) => {
                assert.ifError(err);
                assert.strictEqual(exists, false);
                done();
            });
        });
        mocha_1.it('should pass back any other type of error', done => {
            const error = { code: 4 };
            topic.getMetadata = (callback) => {
                callback(error);
            };
            topic.exists((err, exists) => {
                assert.strictEqual(err, error);
                assert.strictEqual(exists, undefined);
                done();
            });
        });
    });
    mocha_1.describe('getMetadata', () => {
        mocha_1.it('should make the proper request', done => {
            topic.request = (config) => {
                assert.strictEqual(config.client, 'PublisherClient');
                assert.strictEqual(config.method, 'getTopic');
                assert.deepStrictEqual(config.reqOpts, { topic: topic.name });
                done();
            };
            topic.getMetadata(assert.ifError);
        });
        mocha_1.it('should optionally accept gax options', done => {
            const options = {};
            topic.request = (config) => {
                assert.strictEqual(config.gaxOpts, options);
                done();
            };
            topic.getMetadata(options, assert.ifError);
        });
        mocha_1.it('should pass back any errors that occur', done => {
            const error = new Error('err');
            const apiResponse = {};
            topic.request = (config, callback) => {
                callback(error, apiResponse);
            };
            topic.getMetadata((err, metadata) => {
                assert.strictEqual(err, error);
                assert.strictEqual(metadata, apiResponse);
                done();
            });
        });
        mocha_1.it('should set the metadata if no error occurs', done => {
            const apiResponse = {};
            topic.request = (config, callback) => {
                callback(null, apiResponse);
            };
            topic.getMetadata((err, metadata) => {
                assert.ifError(err);
                assert.strictEqual(metadata, apiResponse);
                assert.strictEqual(topic.metadata, apiResponse);
                done();
            });
        });
    });
    mocha_1.describe('getSubscriptions', () => {
        mocha_1.it('should make the correct request', done => {
            const options = {
                a: 'a',
                b: 'b',
                gaxOpts: {
                    e: 'f',
                },
                autoPaginate: false,
            };
            const expectedOptions = Object.assign({
                topic: topic.name,
            }, options);
            const expectedGaxOpts = Object.assign({
                autoPaginate: options.autoPaginate,
            }, options.gaxOpts);
            delete expectedOptions.gaxOpts;
            delete expectedOptions.autoPaginate;
            topic.request = (config) => {
                assert.strictEqual(config.client, 'PublisherClient');
                assert.strictEqual(config.method, 'listTopicSubscriptions');
                assert.deepStrictEqual(config.reqOpts, expectedOptions);
                assert.deepStrictEqual(config.gaxOpts, expectedGaxOpts);
                done();
            };
            topic.getSubscriptions(options, assert.ifError);
        });
        mocha_1.it('should accept only a callback', done => {
            topic.request = (config) => {
                assert.deepStrictEqual(config.reqOpts, { topic: topic.name });
                assert.deepStrictEqual(config.gaxOpts, { autoPaginate: undefined });
                done();
            };
            topic.getSubscriptions(assert.ifError);
        });
        mocha_1.it('should create subscription objects', done => {
            const fakeSubs = ['a', 'b', 'c'];
            topic.subscription = (name) => {
                return {
                    name,
                };
            };
            topic.request = (config, callback) => {
                callback(null, fakeSubs);
            };
            topic.getSubscriptions((err, subscriptions) => {
                assert.ifError(err);
                assert.deepStrictEqual(subscriptions, [
                    { name: 'a' },
                    { name: 'b' },
                    { name: 'c' },
                ]);
                done();
            });
        });
        mocha_1.it('should pass all params to the callback', done => {
            const err_ = new Error('err');
            const subs_ = undefined;
            const nextQuery_ = {};
            const apiResponse_ = {};
            topic.request =
                // tslint:disable-next-line:no-any
                (config, callback) => {
                    callback(err_, subs_, nextQuery_, apiResponse_);
                };
            topic.getSubscriptions(
            // tslint:disable-next-line:no-any
            (err, subs, nextQuery, apiResponse) => {
                assert.strictEqual(err, err_);
                assert.deepStrictEqual(subs, subs_);
                assert.strictEqual(nextQuery, nextQuery_);
                assert.strictEqual(apiResponse, apiResponse_);
                done();
            });
        });
    });
    mocha_1.describe('publish', () => {
        mocha_1.it('should call through to Topic#publishMessage', () => {
            const fdata = Buffer.from('Hello, world!');
            const fattributes = {};
            const fcallback = () => { };
            const stub = sandbox.stub(topic, 'publishMessage');
            topic.publish(fdata, fattributes, fcallback);
            const [{ data, attributes }, callback] = stub.lastCall.args;
            assert.strictEqual(data, fdata);
            assert.strictEqual(attributes, fattributes);
            assert.strictEqual(callback, fcallback);
        });
    });
    mocha_1.describe('publishJSON', () => {
        mocha_1.it('should throw an error for non-object types', () => {
            const expectedError = /First parameter should be an object\./;
            assert.throws(() => topic.publishJSON('hi'), expectedError);
        });
        mocha_1.it('should pass along the attributes and callback', () => {
            const stub = sandbox.stub(topic, 'publishMessage');
            const fakeAttributes = {};
            const fakeCallback = () => { };
            topic.publishJSON({}, fakeAttributes, fakeCallback);
            const [{ attributes }, callback] = stub.lastCall.args;
            assert.strictEqual(attributes, fakeAttributes);
            assert.strictEqual(callback, fakeCallback);
        });
    });
    mocha_1.describe('publishMessage', () => {
        mocha_1.it('should call through to Publisher#publishMessage', () => {
            const stub = sandbox.stub(topic.publisher, 'publishMessage');
            const fdata = Buffer.from('Hello, world!');
            const fattributes = {};
            const fcallback = () => { };
            topic.publish(fdata, fattributes, fcallback);
            const [{ data, attributes }, callback] = stub.lastCall.args;
            assert.strictEqual(data, fdata);
            assert.strictEqual(attributes, fattributes);
            assert.strictEqual(callback, fcallback);
        });
        mocha_1.it('should transform JSON into a Buffer', () => {
            const json = { foo: 'bar' };
            const expectedBuffer = Buffer.from(JSON.stringify(json));
            const stub = sandbox.stub(topic.publisher, 'publishMessage');
            topic.publishMessage({ json });
            const [{ data }] = stub.lastCall.args;
            assert.deepStrictEqual(data, expectedBuffer);
        });
        mocha_1.it('should return the return value of Publisher#publishMessage', () => {
            const fakePromise = Promise.resolve();
            sandbox.stub(topic.publisher, 'publishMessage').resolves(fakePromise);
            const promise = topic.publishMessage({ data: Buffer.from('hi') });
            assert.strictEqual(promise, fakePromise);
        });
    });
    mocha_1.describe('setMetadata', () => {
        const METADATA = {
            labels: { yee: 'haw' },
        };
        let requestStub;
        beforeEach(() => {
            requestStub = sandbox.stub(topic, 'request');
        });
        mocha_1.it('should call the correct rpc', () => {
            topic.setMetadata(METADATA, assert.ifError);
            const [{ client, method }] = requestStub.lastCall.args;
            assert.strictEqual(client, 'PublisherClient');
            assert.strictEqual(method, 'updateTopic');
        });
        mocha_1.it('should send the correct request options', () => {
            topic.setMetadata(METADATA, assert.ifError);
            const expectedTopic = Object.assign({ name: topic.name }, METADATA);
            const expectedUpdateMask = { paths: ['labels'] };
            const [{ reqOpts }] = requestStub.lastCall.args;
            assert.deepStrictEqual(reqOpts.topic, expectedTopic);
            assert.deepStrictEqual(reqOpts.updateMask, expectedUpdateMask);
        });
        mocha_1.it('should accept call options', () => {
            const callOptions = {};
            topic.setMetadata(METADATA, callOptions, assert.ifError);
            const [{ gaxOpts }] = requestStub.lastCall.args;
            assert.strictEqual(gaxOpts, callOptions);
        });
        mocha_1.it('should pass the user callback to request', () => {
            const spy = sandbox.spy();
            topic.setMetadata(METADATA, spy);
            const [, callback] = requestStub.lastCall.args;
            assert.strictEqual(callback, spy);
        });
    });
    mocha_1.describe('setPublishOptions', () => {
        mocha_1.it('should call through to Publisher#setOptions', () => {
            const fakeOptions = {};
            const stub = sandbox
                .stub(topic.publisher, 'setOptions')
                .withArgs(fakeOptions);
            topic.setPublishOptions(fakeOptions);
            assert.strictEqual(stub.callCount, 1);
        });
    });
    mocha_1.describe('subscription', () => {
        mocha_1.it('should pass correct arguments to pubsub#subscription', done => {
            const subscriptionName = 'subName';
            const opts = {};
            topic.parent.subscription = (name, options) => {
                assert.strictEqual(name, subscriptionName);
                assert.deepStrictEqual(options, opts);
                done();
            };
            topic.subscription(subscriptionName, opts);
        });
        mocha_1.it('should attach the topic instance to the options', done => {
            topic.parent.subscription = (name, options) => {
                assert.strictEqual(options.topic, topic);
                done();
            };
            topic.subscription();
        });
        mocha_1.it('should return the result', done => {
            topic.parent.subscription = () => {
                return done;
            };
            const doneFn = topic.subscription();
            doneFn();
        });
    });
});
//# sourceMappingURL=topic.js.map