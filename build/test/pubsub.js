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
const pjy = require("@google-cloud/projectify");
const promisify = require("@google-cloud/promisify");
const arrify = require("arrify");
const assert = require("assert");
const mocha_1 = require("mocha");
const grpc = require("@grpc/grpc-js");
const proxyquire = require("proxyquire");
const sinon = require("sinon");
const pubsubTypes = require("../src/pubsub");
const subby = require("../src/subscription");
const util = require("../src/util");
const PKG = require('../../package.json');
const sandbox = sinon.createSandbox();
const fakeCreds = {};
sandbox.stub(grpc.credentials, 'createInsecure').returns(fakeCreds);
const subscriptionCached = subby.Subscription;
// tslint:disable-next-line no-any
let subscriptionOverride;
function Subscription(pubsub, name, options) {
    const overrideFn = subscriptionOverride || subscriptionCached;
    return new overrideFn(pubsub, name, options);
}
let promisified = false;
const fakePromisify = Object.assign({}, promisify, {
    promisifyAll(
    // tslint:disable-next-line variable-name
    Class, options) {
        if (Class.name !== 'PubSub') {
            return;
        }
        promisified = true;
        assert.deepStrictEqual(options.exclude, [
            'request',
            'snapshot',
            'subscription',
            'topic',
        ]);
    },
});
let pjyOverride;
function fakePjy() {
    return (pjyOverride || pjy.replaceProjectIdToken).apply(null, arguments);
}
class FakeSnapshot {
    constructor() {
        this.calledWith_ = arguments;
    }
}
class FakeTopic {
    constructor() {
        this.calledWith_ = arguments;
    }
}
let extended = false;
const fakePaginator = {
    // tslint:disable-next-line variable-name
    extend(Class, methods) {
        if (Class.name !== 'PubSub') {
            return;
        }
        methods = arrify(methods);
        assert.strictEqual(Class.name, 'PubSub');
        assert.deepStrictEqual(methods, [
            'getSnapshots',
            'getSubscriptions',
            'getTopics',
        ]);
        extended = true;
    },
    streamify(methodName) {
        return methodName;
    },
};
let googleAuthOverride;
function fakeGoogleAuth() {
    return (googleAuthOverride || util.noop).apply(null, arguments);
}
const v1Override = {};
// tslint:disable-next-line no-any
let v1ClientOverrides = {};
function defineOverridableClient(clientName) {
    class DefaultClient {
        fakeMethod() { }
    }
    DefaultClient.scopes = [];
    Object.defineProperty(v1Override, clientName, {
        get() {
            return v1ClientOverrides[clientName] || DefaultClient;
        },
    });
}
defineOverridableClient('FakeClient');
defineOverridableClient('PublisherClient');
defineOverridableClient('SubscriberClient');
mocha_1.describe('PubSub', () => {
    // tslint:disable-next-line variable-name
    let PubSub;
    const PROJECT_ID = 'test-project';
    let pubsub;
    const OPTIONS = {
        projectId: PROJECT_ID,
        promise: {},
    };
    const PUBSUB_EMULATOR_HOST = process.env.PUBSUB_EMULATOR_HOST;
    before(() => {
        delete process.env.PUBSUB_EMULATOR_HOST;
        PubSub = proxyquire('../src/pubsub', {
            '@google-cloud/paginator': {
                paginator: fakePaginator,
            },
            '@google-cloud/promisify': fakePromisify,
            '@google-cloud/projectify': {
                replaceProjectIdToken: fakePjy,
            },
            'google-auth-library': {
                GoogleAuth: fakeGoogleAuth,
            },
            grpc,
            './snapshot': { Snapshot: FakeSnapshot },
            './subscription': { Subscription },
            './topic': { Topic: FakeTopic },
            './v1': v1Override,
        }).PubSub;
    });
    after(() => {
        if (PUBSUB_EMULATOR_HOST) {
            process.env.PUBSUB_EMULATOR_HOST = PUBSUB_EMULATOR_HOST;
        }
    });
    beforeEach(() => {
        v1ClientOverrides = {};
        googleAuthOverride = null;
        pubsub = new PubSub(OPTIONS);
        pubsub.projectId = PROJECT_ID;
    });
    mocha_1.describe('instantiation', () => {
        const DEFAULT_OPTIONS = {
            libName: 'gccl',
            libVersion: PKG.version,
            scopes: [],
        };
        mocha_1.it('should extend the correct methods', () => {
            assert(extended); // See `fakePaginator.extend`
        });
        mocha_1.it('should streamify the correct methods', () => {
            assert.strictEqual(pubsub.getSnapshotsStream, 'getSnapshots');
            assert.strictEqual(pubsub.getSubscriptionsStream, 'getSubscriptions');
            assert.strictEqual(pubsub.getTopicsStream, 'getTopics');
        });
        mocha_1.it('should promisify all the things', () => {
            assert(promisified);
        });
        mocha_1.it('should return an instance', () => {
            assert(new PubSub() instanceof PubSub);
        });
        mocha_1.it('should combine all required scopes', () => {
            v1ClientOverrides.SubscriberClient = {};
            v1ClientOverrides.SubscriberClient.scopes = ['a', 'b', 'c'];
            v1ClientOverrides.PublisherClient = {};
            v1ClientOverrides.PublisherClient.scopes = ['b', 'c', 'd', 'e'];
            const pubsub = new PubSub({});
            const options = { scopes: ['a', 'b', 'c', 'd', 'e'] };
            const expectedOptions = Object.assign({}, DEFAULT_OPTIONS, options);
            assert.deepStrictEqual(pubsub.options, expectedOptions);
        });
        mocha_1.it('should attempt to determine the service path and port', () => {
            const determineBaseUrl_ = PubSub.prototype.determineBaseUrl_;
            let called = false;
            PubSub.prototype.determineBaseUrl_ = () => {
                PubSub.prototype.determineBaseUrl_ = determineBaseUrl_;
                called = true;
            };
            // tslint:disable-next-line no-unused-expression
            new PubSub({});
            assert(called);
        });
        mocha_1.it('should initialize the API object', () => {
            assert.deepStrictEqual(pubsub.api, {});
        });
        mocha_1.it('should cache a local google-auth-library instance', () => {
            const fakeGoogleAuthInstance = {};
            const options = {
                a: 'b',
                c: 'd',
            };
            const expectedOptions = Object.assign({}, DEFAULT_OPTIONS, options);
            googleAuthOverride = (options_) => {
                assert.deepStrictEqual(options_, expectedOptions);
                return fakeGoogleAuthInstance;
            };
            const pubsub = new PubSub(options);
            assert.strictEqual(pubsub.auth, fakeGoogleAuthInstance);
        });
        mocha_1.it('should localize the options provided', () => {
            const expectedOptions = Object.assign({}, DEFAULT_OPTIONS, OPTIONS);
            assert.deepStrictEqual(pubsub.options, expectedOptions);
        });
        mocha_1.it('should set the projectId', () => {
            assert.strictEqual(pubsub.projectId, PROJECT_ID);
        });
        mocha_1.it('should default the projectId to the token', () => {
            const pubsub = new PubSub({});
            assert.strictEqual(pubsub.projectId, '{{projectId}}');
        });
        mocha_1.it('should set isEmulator to false by default', () => {
            assert.strictEqual(pubsub.isEmulator, false);
        });
        mocha_1.it('should localize a Promise override', () => {
            assert.strictEqual(pubsub.Promise, OPTIONS.promise);
        });
    });
    mocha_1.describe('createSubscription', () => {
        const TOPIC_NAME = 'topic';
        pubsub = new pubsubTypes.PubSub({});
        const TOPIC = Object.assign(new FakeTopic(), {
            name: 'projects/' + PROJECT_ID + '/topics/' + TOPIC_NAME,
        });
        const SUB_NAME = 'subscription';
        const SUBSCRIPTION = {
            name: 'projects/' + PROJECT_ID + '/subscriptions/' + SUB_NAME,
        };
        const apiResponse = {
            name: 'subscription-name',
        };
        beforeEach(() => {
            Subscription.formatMetadata_ = (metadata) => {
                return Object.assign({}, metadata);
            };
        });
        mocha_1.it('should throw if no Topic is provided', () => {
            assert.throws(() => {
                // tslint:disable-next-line no-any
                pubsub.createSubscription();
            }, /A Topic is required for a new subscription\./);
        });
        mocha_1.it('should throw if no subscription name is provided', () => {
            assert.throws(() => {
                // tslint:disable-next-line no-any
                pubsub.createSubscription(TOPIC_NAME);
            }, /A subscription name is required./);
        });
        mocha_1.it('should not require configuration options', done => {
            pubsub.request = (config, callback) => {
                callback(null, apiResponse);
            };
            pubsub.createSubscription(TOPIC, SUB_NAME, done);
        });
        mocha_1.it('should allow undefined/optional configuration options', done => {
            pubsub.request = (config, callback) => {
                callback(null, apiResponse);
            };
            // tslint:disable-next-line no-any
            pubsub.createSubscription(TOPIC, SUB_NAME, undefined, done);
        });
        mocha_1.it('should create a Subscription', done => {
            const opts = { a: 'b', c: 'd' };
            pubsub.request = util.noop;
            pubsub.subscription = (subName, options) => {
                assert.strictEqual(subName, SUB_NAME);
                assert.deepStrictEqual(options, opts);
                setImmediate(done);
                return SUBSCRIPTION;
            };
            pubsub.createSubscription(TOPIC, SUB_NAME, opts, assert.ifError);
        });
        mocha_1.it('should create a Topic object from a string', done => {
            pubsub.request = util.noop;
            pubsub.topic = topicName => {
                assert.strictEqual(topicName, TOPIC_NAME);
                setImmediate(done);
                return TOPIC;
            };
            pubsub.createSubscription(TOPIC_NAME, SUB_NAME, assert.ifError);
        });
        mocha_1.it('should send correct request', done => {
            const options = {
                gaxOpts: {},
            };
            pubsub.topic = topicName => {
                return {
                    name: topicName,
                };
            };
            pubsub.subscription = subName => {
                return {
                    name: subName,
                };
            };
            const reqOpts = { topic: TOPIC.name, name: SUB_NAME };
            pubsub.request = config => {
                assert.strictEqual(config.client, 'SubscriberClient');
                assert.strictEqual(config.method, 'createSubscription');
                assert.deepStrictEqual(config.reqOpts, reqOpts);
                assert.deepStrictEqual(config.gaxOpts, options.gaxOpts);
                done();
            };
            pubsub.createSubscription(TOPIC, SUB_NAME, options, assert.ifError);
        });
        mocha_1.it('should pass options to the api request', done => {
            const options = {
                retainAckedMessages: true,
                pushEndpoint: 'https://domain/push',
            };
            const expectedBody = Object.assign({ topic: TOPIC.name, name: SUB_NAME }, options);
            pubsub.topic = () => {
                return {
                    name: TOPIC_NAME,
                };
            };
            pubsub.subscription = () => {
                return {
                    name: SUB_NAME,
                };
            };
            pubsub.request = config => {
                assert.notStrictEqual(config.reqOpts, options);
                assert.deepStrictEqual(config.reqOpts, expectedBody);
                done();
            };
            pubsub.createSubscription(TOPIC, SUB_NAME, options, assert.ifError);
        });
        mocha_1.it('should discard flow control options', done => {
            const options = {
                flowControl: {},
            };
            const expectedBody = {
                topic: TOPIC.name,
                name: SUB_NAME,
            };
            pubsub.topic = () => {
                return {
                    name: TOPIC_NAME,
                };
            };
            pubsub.subscription = () => {
                return {
                    name: SUB_NAME,
                };
            };
            pubsub.request = config => {
                assert.notStrictEqual(config.reqOpts, options);
                assert.deepStrictEqual(config.reqOpts, expectedBody);
                done();
            };
            pubsub.createSubscription(TOPIC, SUB_NAME, options, assert.ifError);
        });
        mocha_1.it('should format the metadata', done => {
            const fakeMetadata = {};
            const formatted = {
                a: 'a',
            };
            Subscription.formatMetadata_ = (metadata) => {
                assert.deepStrictEqual(metadata, fakeMetadata);
                return formatted;
            };
            pubsub.request = (config) => {
                assert.strictEqual(config.reqOpts, formatted);
                done();
            };
            pubsub.createSubscription(TOPIC, SUB_NAME, fakeMetadata, assert.ifError);
        });
        mocha_1.describe('error', () => {
            const error = new Error('Error.');
            const apiResponse = { name: SUB_NAME };
            beforeEach(() => {
                pubsub.request = (config, callback) => {
                    callback(error, apiResponse);
                };
            });
            mocha_1.it('should return error & API response to the callback', done => {
                pubsub.request = (config, callback) => {
                    callback(error, apiResponse);
                };
                function callback(err, sub, resp) {
                    assert.strictEqual(err, error);
                    assert.strictEqual(sub, null);
                    assert.strictEqual(resp, apiResponse);
                    done();
                }
                pubsub.createSubscription(TOPIC_NAME, SUB_NAME, callback);
            });
        });
        mocha_1.describe('success', () => {
            const apiResponse = { name: SUB_NAME };
            beforeEach(() => {
                pubsub.request = (config, callback) => {
                    callback(null, apiResponse);
                };
            });
            mocha_1.it('should return Subscription & resp to the callback', done => {
                const subscription = {};
                pubsub.subscription = () => {
                    return subscription;
                };
                pubsub.request = (config, callback) => {
                    callback(null, apiResponse);
                };
                function callback(err, sub, resp) {
                    assert.ifError(err);
                    assert.strictEqual(sub, subscription);
                    assert.strictEqual(resp, apiResponse);
                    done();
                }
                pubsub.createSubscription(TOPIC_NAME, SUB_NAME, callback);
            });
        });
    });
    mocha_1.describe('createTopic', () => {
        mocha_1.it('should make the correct API request', done => {
            const pubsub = new pubsubTypes.PubSub();
            const topicName = 'new-topic-name';
            const formattedName = 'formatted-name';
            const gaxOpts = {};
            pubsub.topic = name => {
                assert.strictEqual(name, topicName);
                return {
                    name: formattedName,
                };
            };
            pubsub.request = config => {
                assert.strictEqual(config.client, 'PublisherClient');
                assert.strictEqual(config.method, 'createTopic');
                assert.deepStrictEqual(config.reqOpts, { name: formattedName });
                assert.deepStrictEqual(config.gaxOpts, gaxOpts);
                done();
            };
            pubsub.createTopic(topicName, gaxOpts, () => { });
        });
        mocha_1.describe('error', () => {
            const error = new Error('Error.');
            const apiResponse = {};
            beforeEach(() => {
                pubsub.request = (config, callback) => {
                    callback(error, apiResponse);
                };
            });
            mocha_1.it('should return an error & API response', done => {
                pubsub.createTopic('new-topic', (err, topic, apiResponse_) => {
                    assert.strictEqual(err, error);
                    assert.strictEqual(topic, null);
                    assert.strictEqual(apiResponse_, apiResponse);
                    done();
                });
            });
        });
        mocha_1.describe('success', () => {
            const apiResponse = {};
            beforeEach(() => {
                pubsub.request = (config, callback) => {
                    callback(null, apiResponse);
                };
            });
            mocha_1.it('should return a Topic object', done => {
                const topicName = 'new-topic';
                const topicInstance = {};
                pubsub.topic = name => {
                    assert.strictEqual(name, topicName);
                    return topicInstance;
                };
                pubsub.createTopic(topicName, (err, topic) => {
                    assert.ifError(err);
                    assert.strictEqual(topic, topicInstance);
                    done();
                });
            });
            mocha_1.it('should pass apiResponse to callback', done => {
                pubsub.createTopic('new-topic', (err, topic, apiResponse_) => {
                    assert.ifError(err);
                    assert.strictEqual(apiResponse_, apiResponse);
                    done();
                });
            });
        });
    });
    mocha_1.describe('determineBaseUrl_', () => {
        function setHost(host) {
            process.env.PUBSUB_EMULATOR_HOST = host;
        }
        beforeEach(() => {
            delete process.env.PUBSUB_EMULATOR_HOST;
        });
        mocha_1.it('should do nothing if correct options are not set', () => {
            pubsub.determineBaseUrl_();
            assert.strictEqual(pubsub.options.servicePath, undefined);
            assert.strictEqual(pubsub.options.port, undefined);
        });
        mocha_1.it('should use the apiEndpoint option', () => {
            const defaultBaseUrl_ = 'defaulturl';
            const testingUrl = 'localhost:8085';
            setHost(defaultBaseUrl_);
            pubsub.options.apiEndpoint = testingUrl;
            pubsub.determineBaseUrl_();
            assert.strictEqual(pubsub.options.servicePath, 'localhost');
            assert.strictEqual(pubsub.options.port, '8085');
            assert.strictEqual(pubsub.options.sslCreds, fakeCreds);
            assert.strictEqual(pubsub.isEmulator, true);
        });
        mocha_1.it('should remove slashes from the baseUrl', () => {
            setHost('localhost:8080/');
            pubsub.determineBaseUrl_();
            assert.strictEqual(pubsub.options.servicePath, 'localhost');
            assert.strictEqual(pubsub.options.port, '8080');
            setHost('localhost:8081//');
            pubsub.determineBaseUrl_();
            assert.strictEqual(pubsub.options.servicePath, 'localhost');
            assert.strictEqual(pubsub.options.port, '8081');
        });
        mocha_1.it('should set the port to undefined if not set', () => {
            setHost('localhost');
            pubsub.determineBaseUrl_();
            assert.strictEqual(pubsub.options.servicePath, 'localhost');
            assert.strictEqual(pubsub.options.port, undefined);
        });
        mocha_1.it('should create credentials from local grpc if present', () => {
            const fakeCredentials = {};
            const fakeGrpc = {
                credentials: {
                    createInsecure: () => fakeCredentials,
                },
            };
            setHost('localhost');
            pubsub.options.grpc = fakeGrpc;
            pubsub.determineBaseUrl_();
            assert.strictEqual(pubsub.options.sslCreds, fakeCredentials);
        });
        mocha_1.describe('with PUBSUB_EMULATOR_HOST environment variable', () => {
            const PUBSUB_EMULATOR_HOST = 'localhost:9090';
            beforeEach(() => {
                setHost(PUBSUB_EMULATOR_HOST);
            });
            after(() => {
                delete process.env.PUBSUB_EMULATOR_HOST;
            });
            mocha_1.it('should use the PUBSUB_EMULATOR_HOST env var', () => {
                pubsub.determineBaseUrl_();
                assert.strictEqual(pubsub.options.servicePath, 'localhost');
                assert.strictEqual(pubsub.options.port, '9090');
                assert.strictEqual(pubsub.isEmulator, true);
            });
        });
    });
    mocha_1.describe('getSnapshots', () => {
        const SNAPSHOT_NAME = 'fake-snapshot';
        const apiResponse = { snapshots: [{ name: SNAPSHOT_NAME }] };
        beforeEach(() => {
            pubsub.request = (config, callback) => {
                callback(null, apiResponse.snapshots, {}, apiResponse);
            };
        });
        mocha_1.it('should accept a query and a callback', done => {
            pubsub.getSnapshots({}, done);
        });
        mocha_1.it('should accept just a callback', done => {
            pubsub.getSnapshots(done);
        });
        mocha_1.it('should build the right request', done => {
            const options = {
                a: 'b',
                c: 'd',
                gaxOpts: {
                    e: 'f',
                },
                autoPaginate: false,
            };
            const expectedOptions = Object.assign({}, options, {
                project: 'projects/' + pubsub.projectId,
            });
            const expectedGaxOpts = Object.assign({
                autoPaginate: options.autoPaginate,
            }, options.gaxOpts);
            delete expectedOptions.gaxOpts;
            delete expectedOptions.autoPaginate;
            pubsub.request = config => {
                assert.strictEqual(config.client, 'SubscriberClient');
                assert.strictEqual(config.method, 'listSnapshots');
                assert.deepStrictEqual(config.reqOpts, expectedOptions);
                assert.deepStrictEqual(config.gaxOpts, expectedGaxOpts);
                done();
            };
            pubsub.getSnapshots(options, assert.ifError);
        });
        mocha_1.it('should return Snapshot instances with metadata', done => {
            const snapshot = {};
            sandbox.stub(pubsub, 'snapshot').callsFake(name => {
                assert.strictEqual(name, SNAPSHOT_NAME);
                return snapshot;
            });
            pubsub.getSnapshots((err, snapshots) => {
                assert.ifError(err);
                assert.strictEqual(snapshots[0], snapshot);
                assert.strictEqual(snapshots[0].metadata, apiResponse.snapshots[0]);
                done();
            });
        });
        mocha_1.it('should pass back all parameters', done => {
            const err_ = new Error('abc');
            const snapshots_ = undefined;
            const nextQuery_ = {};
            const apiResponse_ = {};
            pubsub.request = (config, callback) => {
                callback(err_, snapshots_, nextQuery_, apiResponse_);
            };
            pubsub.getSnapshots((err, snapshots, apiResponse) => {
                assert.strictEqual(err, err_);
                assert.deepStrictEqual(snapshots, snapshots_);
                assert.strictEqual(apiResponse, nextQuery_);
                done();
            });
        });
    });
    mocha_1.describe('getSubscriptions', () => {
        const apiResponse = { subscriptions: [{ name: 'fake-subscription' }] };
        beforeEach(() => {
            pubsub.request = (config, callback) => {
                callback(null, apiResponse.subscriptions, {}, apiResponse);
            };
        });
        mocha_1.it('should accept a query and a callback', done => {
            pubsub.getSubscriptions({}, done);
        });
        mocha_1.it('should accept just a callback', done => {
            pubsub.getSubscriptions(done);
        });
        mocha_1.it('should pass the correct arguments to the API', done => {
            const options = {
                gaxOpts: {
                    a: 'b',
                },
                autoPaginate: false,
            };
            const expectedGaxOpts = Object.assign({
                autoPaginate: options.autoPaginate,
            }, options.gaxOpts);
            const project = 'projects/' + pubsub.projectId;
            pubsub.request = config => {
                assert.strictEqual(config.client, 'SubscriberClient');
                assert.strictEqual(config.method, 'listSubscriptions');
                assert.deepStrictEqual(config.reqOpts, { project });
                assert.deepStrictEqual(config.gaxOpts, expectedGaxOpts);
                done();
            };
            pubsub.getSubscriptions(options, assert.ifError);
        });
        mocha_1.it('should pass options to API request', done => {
            const opts = { pageSize: 10, pageToken: 'abc' };
            pubsub.request = config => {
                const reqOpts = config.reqOpts;
                const expectedOptions = Object.assign({}, opts, {
                    project: 'projects/' + pubsub.projectId,
                });
                assert.deepStrictEqual(reqOpts, expectedOptions);
                done();
            };
            pubsub.getSubscriptions(opts, assert.ifError);
        });
        mocha_1.it('should return Subscription instances', done => {
            pubsub.getSubscriptions((err, subscriptions) => {
                assert.ifError(err);
                assert(subscriptions[0] instanceof subscriptionCached);
                done();
            });
        });
        mocha_1.it('should pass back all params', done => {
            const err_ = new Error('err');
            const subs_ = undefined;
            const nextQuery_ = {};
            const apiResponse_ = {};
            pubsub.request = (config, callback) => {
                callback(err_, subs_, nextQuery_, apiResponse_);
            };
            pubsub.getSubscriptions((err, subs, apiResponse) => {
                assert.strictEqual(err, err_);
                assert.deepStrictEqual(subs, subs_);
                assert.strictEqual(apiResponse, nextQuery_);
                done();
            });
        });
        mocha_1.describe('with topic', () => {
            const TOPIC_NAME = 'topic-name';
            mocha_1.it('should call topic.getSubscriptions', done => {
                const topic = new FakeTopic();
                const opts = {
                    topic,
                };
                topic.getSubscriptions = (options) => {
                    assert.strictEqual(options, opts);
                    done();
                };
                pubsub.getSubscriptions(opts, assert.ifError);
            });
            mocha_1.it('should create a topic instance from a name', done => {
                const opts = {
                    topic: TOPIC_NAME,
                };
                const fakeTopic = {
                    getSubscriptions(options) {
                        assert.strictEqual(options, opts);
                        done();
                    },
                };
                pubsub.topic = (name) => {
                    assert.strictEqual(name, TOPIC_NAME);
                    return fakeTopic;
                };
                pubsub.getSubscriptions(opts, assert.ifError);
            });
        });
    });
    mocha_1.describe('getTopics', () => {
        const topicName = 'fake-topic';
        const apiResponse = { topics: [{ name: topicName }] };
        beforeEach(() => {
            pubsub.request = (config, callback) => {
                callback(null, apiResponse.topics, {}, apiResponse);
            };
        });
        mocha_1.it('should accept a query and a callback', done => {
            pubsub.getTopics({}, done);
        });
        mocha_1.it('should accept just a callback', done => {
            pubsub.getTopics(done);
        });
        mocha_1.it('should build the right request', done => {
            const options = {
                a: 'b',
                c: 'd',
                gaxOpts: {
                    e: 'f',
                },
                autoPaginate: false,
            };
            const expectedOptions = Object.assign({}, options, {
                project: 'projects/' + pubsub.projectId,
            });
            const expectedGaxOpts = Object.assign({
                autoPaginate: options.autoPaginate,
            }, options.gaxOpts);
            delete expectedOptions.gaxOpts;
            delete expectedOptions.autoPaginate;
            pubsub.request = config => {
                assert.strictEqual(config.client, 'PublisherClient');
                assert.strictEqual(config.method, 'listTopics');
                assert.deepStrictEqual(config.reqOpts, expectedOptions);
                assert.deepStrictEqual(config.gaxOpts, expectedGaxOpts);
                done();
            };
            pubsub.getTopics(options, assert.ifError);
        });
        mocha_1.it('should return Topic instances with metadata', done => {
            const topic = {};
            pubsub.topic = name => {
                assert.strictEqual(name, topicName);
                return topic;
            };
            pubsub.getTopics((err, topics) => {
                assert.ifError(err);
                assert.strictEqual(topics[0], topic);
                assert.strictEqual(topics[0].metadata, apiResponse.topics[0]);
                done();
            });
        });
        mocha_1.it('should pass back all params', done => {
            const err_ = new Error('err');
            const topics_ = undefined;
            const nextQuery_ = {};
            const apiResponse_ = {};
            pubsub.request = (config, callback) => {
                callback(err_, topics_, nextQuery_, apiResponse_);
            };
            pubsub.getTopics((err, topics, apiResponse) => {
                assert.strictEqual(err, err_);
                assert.deepStrictEqual(topics, topics_);
                assert.strictEqual(apiResponse, nextQuery_);
                done();
            });
        });
    });
    mocha_1.describe('request', () => {
        const CONFIG = {
            client: 'PublisherClient',
            method: 'fakeMethod',
            reqOpts: { a: 'a' },
            gaxOpts: { b: 'b' },
        };
        beforeEach(() => {
            delete pubsub.projectId;
            afterEach(() => sandbox.restore());
            sandbox.stub(pubsub, 'auth').value({
                getProjectId: () => Promise.resolve(PROJECT_ID),
            });
            // tslint:disable-next-line no-any
            pjyOverride = (reqOpts) => {
                return reqOpts;
            };
        });
        mocha_1.it('should call getClient_ with the correct config', done => {
            pubsub.getClient_ = config => {
                assert.strictEqual(config, CONFIG);
                done();
            };
            pubsub.request(CONFIG, assert.ifError);
        });
        mocha_1.it('should return error from getClient_', done => {
            const expectedError = new Error('some error');
            pubsub.getClient_ = (config, callback) => {
                callback(expectedError);
            };
            pubsub.request(CONFIG, (err) => {
                assert.strictEqual(expectedError, err);
                done();
            });
        });
        mocha_1.it('should call client method with correct options', done => {
            const fakeClient = {};
            // tslint:disable-next-line no-any
            fakeClient.fakeMethod = (reqOpts, gaxOpts) => {
                assert.deepStrictEqual(CONFIG.reqOpts, reqOpts);
                assert.deepStrictEqual(CONFIG.gaxOpts, gaxOpts);
                done();
            };
            pubsub.getClient_ = (config, callback) => {
                callback(null, fakeClient);
            };
            pubsub.request(CONFIG, assert.ifError);
        });
        mocha_1.it('should replace the project id token on reqOpts', done => {
            // tslint:disable-next-line no-any
            pjyOverride = (reqOpts, projectId) => {
                assert.deepStrictEqual(reqOpts, CONFIG.reqOpts);
                assert.strictEqual(projectId, PROJECT_ID);
                done();
            };
            pubsub.request(CONFIG, assert.ifError);
        });
    });
    mocha_1.describe('getClientAsync_', () => {
        const FAKE_CLIENT_INSTANCE = class {
        };
        const CONFIG = {
            client: 'FakeClient',
        };
        beforeEach(() => {
            sandbox.stub(pubsub, 'auth').value({ getProjectId: () => util.noop });
            v1ClientOverrides.FakeClient = FAKE_CLIENT_INSTANCE;
        });
        afterEach(() => sandbox.restore());
        mocha_1.describe('project ID', () => {
            beforeEach(() => {
                delete pubsub.projectId;
                pubsub.isEmulator = false;
            });
            mocha_1.it('should get and cache the project ID', async () => {
                sandbox.stub(pubsub.auth, 'getProjectId').resolves(PROJECT_ID);
                await pubsub.getClientAsync_(CONFIG);
                assert.strictEqual(pubsub.projectId, PROJECT_ID);
                assert.strictEqual(pubsub.options.projectId, PROJECT_ID);
            });
            mocha_1.it('should get the project ID if placeholder', async () => {
                pubsub.projectId = '{{projectId}}';
                sandbox.stub(pubsub.auth, 'getProjectId').resolves(PROJECT_ID);
                await pubsub.getClientAsync_(CONFIG);
                assert.strictEqual(pubsub.projectId, PROJECT_ID);
            });
            mocha_1.it('should return auth errors that occur', async () => {
                const error = new Error('err');
                sandbox.stub(pubsub.auth, 'getProjectId').rejects(error);
                try {
                    await pubsub.getClientAsync_(CONFIG);
                    throw new Error('getClientAsync_ should have thrown an error');
                }
                catch (e) {
                    assert.strictEqual(e, error);
                }
            });
            mocha_1.it('should ignore auth errors when using the emulator', async () => {
                pubsub.isEmulator = true;
                const error = new Error('err');
                sandbox.stub(pubsub.auth, 'getProjectId').rejects(error);
                await pubsub.getClientAsync_(CONFIG);
                assert.strictEqual(pubsub.projectId, '');
            });
            mocha_1.it('should not get the project ID if already known', async () => {
                pubsub.projectId = PROJECT_ID;
                const error = new Error('getProjectId should not be called.');
                sandbox.stub(pubsub.auth, 'getProjectId').rejects(error);
                await pubsub.getClientAsync_(CONFIG);
            });
        });
        mocha_1.it('should cache the client', async () => {
            delete pubsub.api.fakeClient;
            let numTimesFakeClientInstantiated = 0;
            // tslint:disable-next-line only-arrow-functions
            v1ClientOverrides.FakeClient = function () {
                numTimesFakeClientInstantiated++;
                return FAKE_CLIENT_INSTANCE;
            };
            await pubsub.getClientAsync_(CONFIG);
            assert.strictEqual(pubsub.api.FakeClient, FAKE_CLIENT_INSTANCE);
            await pubsub.getClientAsync_(CONFIG);
            assert.strictEqual(numTimesFakeClientInstantiated, 1);
        });
        mocha_1.it('should return the correct client', async () => {
            // tslint:disable-next-line only-arrow-functions no-any
            v1ClientOverrides.FakeClient = function (options) {
                assert.strictEqual(options, pubsub.options);
                return FAKE_CLIENT_INSTANCE;
            };
            const client = await pubsub.getClientAsync_(CONFIG);
            assert.strictEqual(client, FAKE_CLIENT_INSTANCE);
        });
    });
    mocha_1.describe('getClient_', () => {
        const FAKE_CLIENT_INSTANCE = {};
        const CONFIG = {
            client: 'FakeClient',
        };
        mocha_1.it('should get the client', done => {
            sandbox
                .stub(pubsub, 'getClientAsync_')
                .withArgs(CONFIG)
                .resolves(FAKE_CLIENT_INSTANCE);
            pubsub.getClient_(CONFIG, (err, client) => {
                assert.ifError(err);
                assert.strictEqual(client, FAKE_CLIENT_INSTANCE);
                done();
            });
        });
        mocha_1.it('should pass back any errors', done => {
            const error = new Error('err');
            sandbox.stub(pubsub, 'getClientAsync_').rejects(error);
            pubsub.getClient_(CONFIG, err => {
                assert.strictEqual(err, error);
                done();
            });
        });
    });
    mocha_1.describe('request', () => {
        const CONFIG = {
            client: 'SubscriberClient',
            method: 'fakeMethod',
            reqOpts: { a: 'a' },
            gaxOpts: {},
        };
        const FAKE_CLIENT_INSTANCE = {
            [CONFIG.method]: util.noop,
        };
        beforeEach(() => {
            // tslint:disable-next-line no-any
            pjyOverride = (reqOpts) => {
                return reqOpts;
            };
            pubsub.getClient_ = (config, callback) => {
                callback(null, FAKE_CLIENT_INSTANCE);
            };
        });
        afterEach(() => sandbox.restore());
        mocha_1.it('should get the client', done => {
            pubsub.getClient_ = config => {
                assert.strictEqual(config, CONFIG);
                done();
            };
            pubsub.request(CONFIG, assert.ifError);
        });
        mocha_1.it('should return error from getting the client', done => {
            const error = new Error('Error.');
            pubsub.getClient_ = (config, callback) => {
                callback(error);
            };
            pubsub.request(CONFIG, (err) => {
                assert.strictEqual(err, error);
                done();
            });
        });
        mocha_1.it('should replace the project id token on reqOpts', done => {
            // tslint:disable-next-line no-any
            pjyOverride = (reqOpts, projectId) => {
                assert.deepStrictEqual(reqOpts, CONFIG.reqOpts);
                assert.strictEqual(projectId, PROJECT_ID);
                done();
            };
            pubsub.request(CONFIG, assert.ifError);
        });
        mocha_1.it('should call the client method correctly', done => {
            const CONFIG = {
                client: 'FakeClient',
                method: 'fakeMethod',
                reqOpts: { a: 'a' },
                gaxOpts: {},
            };
            const replacedReqOpts = {};
            pjyOverride = () => {
                return replacedReqOpts;
            };
            const fakeClient = {
                // tslint:disable-next-line no-any
                fakeMethod(reqOpts, gaxOpts) {
                    assert.strictEqual(reqOpts, replacedReqOpts);
                    assert.strictEqual(gaxOpts, CONFIG.gaxOpts);
                    done();
                },
            };
            pubsub.getClient_ = (config, callback) => {
                callback(null, fakeClient);
            };
            pubsub.request(CONFIG, assert.ifError);
        });
    });
    mocha_1.describe('snapshot', () => {
        mocha_1.it('should throw if a name is not provided', () => {
            assert.throws(() => {
                // tslint:disable-next-line no-any
                pubsub.snapshot();
            }, /You must supply a valid name for the snapshot\./);
        });
        mocha_1.it('should return a Snapshot object', () => {
            const SNAPSHOT_NAME = 'new-snapshot';
            const snapshot = pubsub.snapshot(SNAPSHOT_NAME);
            const args = snapshot.calledWith_;
            assert(snapshot instanceof FakeSnapshot);
            assert.strictEqual(args[0], pubsub);
            assert.strictEqual(args[1], SNAPSHOT_NAME);
        });
    });
    mocha_1.describe('subscription', () => {
        const SUB_NAME = 'new-sub-name';
        const CONFIG = {};
        mocha_1.it('should return a Subscription object', () => {
            // tslint:disable-next-line only-arrow-functions
            subscriptionOverride = function () { };
            const subscription = pubsub.subscription(SUB_NAME, {});
            assert(subscription instanceof subscriptionOverride);
        });
        mocha_1.it('should pass specified name to the Subscription', done => {
            // tslint:disable-next-line only-arrow-functions
            subscriptionOverride = function (pubsub, name) {
                assert.strictEqual(name, SUB_NAME);
                done();
            };
            pubsub.subscription(SUB_NAME);
        });
        mocha_1.it('should honor settings', done => {
            // tslint:disable-next-line only-arrow-functions
            subscriptionOverride = function (pubsub, name, options) {
                assert.strictEqual(options, CONFIG);
                done();
            };
            pubsub.subscription(SUB_NAME, CONFIG);
        });
        mocha_1.it('should throw if a name is not provided', () => {
            assert.throws(() => {
                // tslint:disable-next-line no-any
                return pubsub.subscription();
            }, /A name must be specified for a subscription\./);
        });
    });
    mocha_1.describe('topic', () => {
        mocha_1.it('should throw if a name is not provided', () => {
            assert.throws(() => {
                // tslint:disable-next-line no-any
                pubsub.topic();
            }, /A name must be specified for a topic\./);
        });
        mocha_1.it('should return a Topic object', () => {
            assert(pubsub.topic('new-topic') instanceof FakeTopic);
        });
        mocha_1.it('should pass the correct args', () => {
            const fakeName = 'with-options';
            const fakeOptions = {};
            const topic = pubsub.topic(fakeName, fakeOptions);
            const [ps, name, options] = topic.calledWith_;
            assert.strictEqual(ps, pubsub);
            assert.strictEqual(name, fakeName);
            assert.strictEqual(options, fakeOptions);
        });
    });
});
//# sourceMappingURL=pubsub.js.map