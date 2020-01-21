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
const events_1 = require("events");
const proxyquire = require("proxyquire");
const sinon = require("sinon");
const util = require("../src/util");
let promisified = false;
const fakePromisify = Object.assign({}, pfy, {
    promisifyAll: (klass, options) => {
        if (klass.name !== 'Subscription') {
            return;
        }
        promisified = true;
        assert.deepStrictEqual(options.exclude, ['open', 'snapshot']);
    },
});
class FakeIAM {
    constructor() {
        this.calledWith_ = arguments;
    }
}
class FakeSnapshot {
    constructor() {
        this.calledWith_ = arguments;
    }
}
let subscriber;
class FakeSubscriber extends events_1.EventEmitter {
    constructor() {
        super();
        this.isOpen = false;
        this.calledWith_ = arguments;
        subscriber = this;
    }
    open() {
        this.isOpen = true;
    }
    async close() {
        this.isOpen = false;
    }
    setOptions(options) { }
}
mocha_1.describe('Subscription', () => {
    // tslint:disable-next-line variable-name
    let Subscription;
    let subscription;
    const PROJECT_ID = 'test-project';
    const SUB_NAME = 'test-subscription';
    const SUB_FULL_NAME = 'projects/' + PROJECT_ID + '/subscriptions/' + SUB_NAME;
    const PUBSUB = {
        projectId: PROJECT_ID,
        Promise: {},
        request: util.noop,
        createSubscription: util.noop,
    };
    before(() => {
        Subscription = proxyquire('../src/subscription.js', {
            '@google-cloud/promisify': fakePromisify,
            './iam.js': { IAM: FakeIAM },
            './snapshot.js': { Snapshot: FakeSnapshot },
            './subscriber.js': { Subscriber: FakeSubscriber },
        }).Subscription;
    });
    const sandbox = sinon.createSandbox();
    beforeEach(() => {
        PUBSUB.request = util.noop;
        subscription = new Subscription(PUBSUB, SUB_NAME);
    });
    afterEach(() => sandbox.restore());
    mocha_1.describe('initialization', () => {
        mocha_1.it('should promisify all the things', () => {
            assert(promisified);
        });
        mocha_1.it('should localize the pubsub object', () => {
            assert.strictEqual(subscription.pubsub, PUBSUB);
        });
        mocha_1.it('should localize the project id', () => {
            assert.strictEqual(subscription.projectId, PROJECT_ID);
        });
        mocha_1.it('should localize pubsub request method', done => {
            PUBSUB.request = () => {
                done();
            };
            const subscription = new Subscription(PUBSUB, SUB_NAME);
            // tslint:disable-next-line no-any
            subscription.request(assert.ifError);
        });
        mocha_1.it('should format the sub name', () => {
            const formattedName = 'a/b/c/d';
            const formatName = Subscription.formatName_;
            Subscription.formatName_ = (projectId, name) => {
                assert.strictEqual(projectId, PROJECT_ID);
                assert.strictEqual(name, SUB_NAME);
                Subscription.formatName_ = formatName;
                return formattedName;
            };
            const subscription = new Subscription(PUBSUB, SUB_NAME);
            assert.strictEqual(subscription.name, formattedName);
        });
        mocha_1.it('should create an IAM object', () => {
            assert(subscription.iam instanceof FakeIAM);
            const args = subscription.iam.calledWith_;
            assert.strictEqual(args[0], PUBSUB);
            assert.strictEqual(args[1], subscription.name);
        });
        mocha_1.it('should create a Subscriber', () => {
            const options = {};
            const subscription = new Subscription(PUBSUB, SUB_NAME, options);
            const [sub, opts] = subscriber.calledWith_;
            assert.strictEqual(sub, subscription);
            assert.strictEqual(opts, options);
        });
        mocha_1.it('should open the subscriber when a listener is attached', () => {
            const stub = sandbox.stub(subscriber, 'open');
            subscription.on('message', () => { });
            assert.strictEqual(stub.callCount, 1);
        });
        mocha_1.it('should close the subscriber when no listeners are attached', () => {
            const stub = sandbox.stub(subscriber, 'close');
            const cb = () => { };
            subscription.on('message', cb);
            subscription.removeListener('message', cb);
            assert.strictEqual(stub.callCount, 1);
        });
        mocha_1.it('should emit messages', done => {
            const message = {};
            subscription.on('message', (msg) => {
                assert.strictEqual(msg, message);
                done();
            });
            subscriber.emit('message', message);
        });
        mocha_1.it('should emit errors', done => {
            const error = new Error('err');
            subscription.on('error', (err) => {
                assert.strictEqual(err, error);
                done();
            });
            subscriber.emit('error', error);
        });
        mocha_1.it('should emit close events', done => {
            subscription.on('close', done);
            subscriber.emit('close');
        });
    });
    mocha_1.describe('formatMetadata_', () => {
        mocha_1.it('should make a copy of the metadata', () => {
            const metadata = { a: 'a' };
            const formatted = Subscription.formatMetadata_(metadata);
            assert.deepStrictEqual(metadata, formatted);
            assert.notStrictEqual(metadata, formatted);
        });
        mocha_1.it('should format messageRetentionDuration', () => {
            const threeDaysInSeconds = 3 * 24 * 60 * 60;
            const metadata = {
                messageRetentionDuration: threeDaysInSeconds,
            };
            const formatted = Subscription.formatMetadata_(metadata);
            assert.strictEqual(formatted.messageRetentionDuration.nanos, 0);
            assert.strictEqual(formatted.messageRetentionDuration.seconds, threeDaysInSeconds);
        });
        mocha_1.it('should format pushEndpoint', () => {
            const pushEndpoint = 'http://noop.com/push';
            const metadata = {
                pushEndpoint,
            };
            const formatted = Subscription.formatMetadata_(metadata);
            assert.strictEqual(formatted.pushConfig.pushEndpoint, pushEndpoint);
            assert.strictEqual(formatted.pushEndpoint, undefined);
        });
    });
    mocha_1.describe('formatName_', () => {
        mocha_1.it('should format name', () => {
            const formattedName = Subscription.formatName_(PROJECT_ID, SUB_NAME);
            assert.strictEqual(formattedName, SUB_FULL_NAME);
        });
        mocha_1.it('should format name when given a complete name', () => {
            const formattedName = Subscription.formatName_(PROJECT_ID, SUB_FULL_NAME);
            assert.strictEqual(formattedName, SUB_FULL_NAME);
        });
    });
    mocha_1.describe('close', () => {
        mocha_1.it('should call the success callback', done => {
            sandbox.stub(subscriber, 'close').resolves();
            subscription.close(done);
        });
        mocha_1.it('should pass back any errors that occurs', done => {
            const fakeErr = new Error('err');
            sandbox.stub(subscriber, 'close').rejects(fakeErr);
            subscription.close(err => {
                assert.strictEqual(err, fakeErr);
                done();
            });
        });
    });
    mocha_1.describe('create', () => {
        const TOPIC_NAME = 'hi-ho-silver';
        beforeEach(() => {
            subscription.topic = TOPIC_NAME;
        });
        mocha_1.it('should throw an error if theres no topic', () => {
            const expectedError = /Subscriptions can only be created when accessed through Topics/;
            delete subscription.topic;
            assert.throws(() => subscription.create(), expectedError);
        });
        mocha_1.it('should pass the correct params', () => {
            const fakeOptions = {};
            const stub = sandbox.stub(PUBSUB, 'createSubscription');
            subscription.create(fakeOptions, assert.ifError);
            const [topic, name, options] = stub.lastCall.args;
            assert.strictEqual(topic, TOPIC_NAME);
            assert.strictEqual(name, SUB_NAME);
            assert.strictEqual(options, fakeOptions);
        });
        mocha_1.it('should optionally accept options', () => {
            const stub = sandbox.stub(PUBSUB, 'createSubscription');
            subscription.create(assert.ifError);
            const options = stub.lastCall.args[2];
            assert.deepStrictEqual(options, {});
        });
        mocha_1.it('should return any request errors', done => {
            const fakeErr = new Error('err');
            const fakeResponse = {};
            const stub = sandbox.stub(PUBSUB, 'createSubscription');
            subscription.create((err, sub, resp) => {
                assert.strictEqual(err, fakeErr);
                assert.strictEqual(sub, null);
                assert.strictEqual(resp, fakeResponse);
                done();
            });
            const callback = stub.lastCall.args[3];
            setImmediate(callback, fakeErr, null, fakeResponse);
        });
        mocha_1.it('should update the subscription', done => {
            const stub = sandbox.stub(PUBSUB, 'createSubscription');
            const fakeSub = new Subscription(PUBSUB, SUB_FULL_NAME);
            const fakeResponse = {};
            subscription.create(err => {
                assert.ifError(err);
                assert.strictEqual(subscription.metadata, fakeResponse);
                done();
            });
            const callback = stub.lastCall.args[3];
            fakeSub.metadata = fakeResponse;
            setImmediate(callback, null, fakeSub, fakeResponse);
        });
        mocha_1.it('should pass back all the things', done => {
            const fakeResponse = {};
            const stub = sandbox.stub(PUBSUB, 'createSubscription');
            subscription.create((err, sub, resp) => {
                assert.ifError(err);
                assert.strictEqual(sub, subscription);
                assert.strictEqual(resp, fakeResponse);
                done();
            });
            const callback = stub.lastCall.args[3];
            setImmediate(callback, null, null, fakeResponse);
        });
    });
    mocha_1.describe('createSnapshot', () => {
        const SNAPSHOT_NAME = 'test-snapshot';
        beforeEach(() => {
            subscription.snapshot = (name) => {
                return {
                    name,
                };
            };
        });
        mocha_1.it('should throw an error if a snapshot name is not found', () => {
            assert.throws(() => {
                // tslint:disable-next-line no-any
                subscription.createSnapshot();
            }, /A name is required to create a snapshot\./);
        });
        mocha_1.it('should make the correct request', done => {
            subscription.request = config => {
                assert.strictEqual(config.client, 'SubscriberClient');
                assert.strictEqual(config.method, 'createSnapshot');
                assert.deepStrictEqual(config.reqOpts, {
                    name: SNAPSHOT_NAME,
                    subscription: subscription.name,
                });
                done();
            };
            subscription.createSnapshot(SNAPSHOT_NAME, assert.ifError);
        });
        mocha_1.it('should optionally accept gax options', done => {
            const gaxOpts = {};
            subscription.request = config => {
                assert.strictEqual(config.gaxOpts, gaxOpts);
                done();
            };
            subscription.createSnapshot(SNAPSHOT_NAME, gaxOpts, assert.ifError);
        });
        mocha_1.it('should pass back any errors to the callback', done => {
            const error = new Error('err');
            const apiResponse = {};
            subscription.request = (config, callback) => {
                callback(error, apiResponse);
            };
            subscription.createSnapshot(SNAPSHOT_NAME, (err, snapshot, resp) => {
                assert.strictEqual(err, error);
                assert.strictEqual(snapshot, null);
                assert.strictEqual(resp, apiResponse);
                done();
            });
        });
        mocha_1.it('should return a snapshot object with metadata', done => {
            const apiResponse = {};
            const fakeSnapshot = {};
            subscription.snapshot = () => {
                return fakeSnapshot;
            };
            subscription.request = (config, callback) => {
                callback(null, apiResponse);
            };
            subscription.createSnapshot(SNAPSHOT_NAME, (err, snapshot, resp) => {
                assert.ifError(err);
                assert.strictEqual(snapshot, fakeSnapshot);
                assert.strictEqual(snapshot.metadata, apiResponse);
                assert.strictEqual(resp, apiResponse);
                done();
            });
        });
    });
    mocha_1.describe('delete', () => {
        beforeEach(() => {
            sandbox.stub(subscription, 'removeAllListeners').yields(util.noop);
            sandbox.stub(subscription, 'close').yields(util.noop);
        });
        mocha_1.it('should make the correct request', done => {
            subscription.request = (config) => {
                assert.strictEqual(config.client, 'SubscriberClient');
                assert.strictEqual(config.method, 'deleteSubscription');
                assert.deepStrictEqual(config.reqOpts, {
                    subscription: subscription.name,
                });
                done();
            };
            subscription.delete(assert.ifError);
        });
        mocha_1.it('should optionally accept gax options', done => {
            const gaxOpts = {};
            subscription.request = (config) => {
                assert.strictEqual(config.gaxOpts, gaxOpts);
                done();
            };
            subscription.delete(gaxOpts, assert.ifError);
        });
        mocha_1.describe('success', () => {
            const apiResponse = {};
            beforeEach(() => {
                subscription.request = (config, callback) => {
                    callback(null, apiResponse);
                };
            });
            mocha_1.it('should return the api response', done => {
                subscription.delete((err, resp) => {
                    assert.ifError(err);
                    assert.strictEqual(resp, apiResponse);
                    done();
                });
            });
            mocha_1.it('should close the subscriber if open', done => {
                const stub = sandbox.stub(subscriber, 'close');
                subscription.open();
                subscription.delete(err => {
                    assert.ifError(err);
                    assert.strictEqual(stub.callCount, 1);
                    done();
                });
            });
        });
        mocha_1.describe('error', () => {
            const error = new Error('err');
            beforeEach(() => {
                subscription.request = (config, callback) => {
                    callback(error);
                };
            });
            mocha_1.it('should return the error to the callback', done => {
                subscription.delete(err => {
                    assert.strictEqual(err, error);
                    done();
                });
            });
            mocha_1.it('should not remove all the listeners', done => {
                // tslint:disable-next-line no-any
                subscription.removeAllListeners = () => {
                    done(new Error('Should not be called.'));
                };
                subscription.delete(() => {
                    done();
                });
            });
            mocha_1.it('should not close the subscription', done => {
                subscription.close = async () => {
                    done(new Error('Should not be called.'));
                };
                subscription.delete(() => {
                    done();
                });
            });
        });
    });
    mocha_1.describe('exists', () => {
        mocha_1.it('should return true if it finds metadata', done => {
            sandbox.stub(subscription, 'getMetadata').yields(null, {});
            subscription.exists((err, exists) => {
                assert.ifError(err);
                assert(exists);
                done();
            });
        });
        mocha_1.it('should return false if a not found error occurs', done => {
            const error = { code: 5 };
            sandbox.stub(subscription, 'getMetadata').yields(error);
            subscription.exists((err, exists) => {
                assert.ifError(err);
                assert.strictEqual(exists, false);
                done();
            });
        });
        mocha_1.it('should pass back any other type of error', done => {
            const error = { code: 4 };
            sandbox.stub(subscription, 'getMetadata').yields(error);
            subscription.exists((err, exists) => {
                assert.strictEqual(err, error);
                assert.strictEqual(exists, undefined);
                done();
            });
        });
    });
    mocha_1.describe('get', () => {
        mocha_1.it('should delete the autoCreate option', done => {
            const options = {
                autoCreate: true,
                a: 'a',
            };
            sandbox.stub(subscription, 'getMetadata').callsFake(gaxOpts => {
                assert.strictEqual(gaxOpts, options);
                // tslint:disable-next-line no-any
                assert.strictEqual(gaxOpts.autoCreate, undefined);
                done();
            });
            subscription.get(options, assert.ifError);
        });
        mocha_1.describe('success', () => {
            const fakeMetadata = {};
            mocha_1.it('should call through to getMetadata', done => {
                sandbox
                    .stub(subscription, 'getMetadata')
                    .callsFake((gaxOpts, callback) => {
                    callback(null, fakeMetadata);
                });
                subscription.get((err, sub, resp) => {
                    assert.ifError(err);
                    assert.strictEqual(sub, subscription);
                    assert.strictEqual(resp, fakeMetadata);
                    done();
                });
            });
            mocha_1.it('should optionally accept options', done => {
                const options = {};
                sandbox
                    .stub(subscription, 'getMetadata')
                    .callsFake((gaxOpts, callback) => {
                    assert.strictEqual(gaxOpts, options);
                    callback(null); // the done fn
                });
                subscription.get(options, done);
            });
        });
        mocha_1.describe('error', () => {
            mocha_1.it('should pass back errors when not auto-creating', done => {
                const error = { code: 4 };
                const apiResponse = {};
                sandbox
                    .stub(subscription, 'getMetadata')
                    .callsArgWith(1, error, apiResponse);
                subscription.get((err, sub, resp) => {
                    assert.strictEqual(err, error);
                    assert.strictEqual(sub, null);
                    assert.strictEqual(resp, apiResponse);
                    done();
                });
            });
            mocha_1.it('should pass back 404 errors if autoCreate is false', done => {
                const error = { code: 5 };
                const apiResponse = {};
                sandbox
                    .stub(subscription, 'getMetadata')
                    .callsArgWith(1, error, apiResponse);
                subscription.get((err, sub, resp) => {
                    assert.strictEqual(err, error);
                    assert.strictEqual(sub, null);
                    assert.strictEqual(resp, apiResponse);
                    done();
                });
            });
            mocha_1.it('should pass back 404 errors if create doesnt exist', done => {
                const error = { code: 5 };
                const apiResponse = {};
                sandbox
                    .stub(subscription, 'getMetadata')
                    .callsArgWith(1, error, apiResponse);
                delete subscription.create;
                subscription.get((err, sub, resp) => {
                    assert.strictEqual(err, error);
                    assert.strictEqual(sub, null);
                    assert.strictEqual(resp, apiResponse);
                    done();
                });
            });
            mocha_1.it('should create the sub if 404 + autoCreate is true', done => {
                const error = { code: 5 };
                const apiResponse = {};
                const fakeOptions = {
                    autoCreate: true,
                };
                sandbox
                    .stub(subscription, 'getMetadata')
                    .callsArgWith(1, error, apiResponse);
                sandbox.stub(subscription, 'create').callsFake(options => {
                    assert.strictEqual(options.gaxOpts, fakeOptions);
                    done();
                });
                subscription.topic = 'hi-ho-silver';
                subscription.get(fakeOptions, assert.ifError);
            });
        });
    });
    mocha_1.describe('getMetadata', () => {
        mocha_1.it('should make the correct request', done => {
            subscription.request = config => {
                assert.strictEqual(config.client, 'SubscriberClient');
                assert.strictEqual(config.method, 'getSubscription');
                assert.deepStrictEqual(config.reqOpts, {
                    subscription: subscription.name,
                });
                done();
            };
            subscription.getMetadata(assert.ifError);
        });
        mocha_1.it('should optionally accept gax options', done => {
            const gaxOpts = {};
            subscription.request = config => {
                assert.strictEqual(config.gaxOpts, gaxOpts);
                done();
            };
            subscription.getMetadata(gaxOpts, assert.ifError);
        });
        mocha_1.it('should pass back any errors that occur', done => {
            const error = new Error('err');
            const apiResponse = {};
            subscription.request = (config, callback) => {
                callback(error, apiResponse);
            };
            subscription.getMetadata((err, metadata) => {
                assert.strictEqual(err, error);
                assert.strictEqual(metadata, apiResponse);
                done();
            });
        });
        mocha_1.it('should set the metadata if no error occurs', done => {
            const apiResponse = {};
            subscription.request = (config, callback) => {
                callback(null, apiResponse);
            };
            subscription.getMetadata((err, metadata) => {
                assert.ifError(err);
                assert.strictEqual(metadata, apiResponse);
                assert.strictEqual(subscription.metadata, apiResponse);
                done();
            });
        });
    });
    mocha_1.describe('modifyPushConfig', () => {
        const fakeConfig = {};
        mocha_1.it('should make the correct request', done => {
            subscription.request = config => {
                assert.strictEqual(config.client, 'SubscriberClient');
                assert.strictEqual(config.method, 'modifyPushConfig');
                assert.deepStrictEqual(config.reqOpts, {
                    subscription: subscription.name,
                    pushConfig: fakeConfig,
                });
                done();
            };
            subscription.modifyPushConfig(fakeConfig, assert.ifError);
        });
        mocha_1.it('should optionally accept gaxOpts', done => {
            const gaxOpts = {};
            subscription.request = config => {
                assert.strictEqual(config.gaxOpts, gaxOpts);
                done();
            };
            subscription.modifyPushConfig(fakeConfig, gaxOpts, assert.ifError);
        });
    });
    mocha_1.describe('open', () => {
        mocha_1.it('should open the subscriber', () => {
            const stub = sandbox.stub(subscriber, 'open');
            subscription.open();
            assert.strictEqual(stub.callCount, 1);
        });
        mocha_1.it('should noop if already open', () => {
            const spy = sandbox.spy(subscriber, 'open');
            subscription.open();
            subscription.open();
            assert.strictEqual(spy.callCount, 1);
        });
    });
    mocha_1.describe('seek', () => {
        const FAKE_SNAPSHOT_NAME = 'a';
        const FAKE_FULL_SNAPSHOT_NAME = 'a/b/c/d';
        beforeEach(() => {
            FakeSnapshot.formatName_ = () => {
                return FAKE_FULL_SNAPSHOT_NAME;
            };
        });
        mocha_1.it('should throw if a name or date is not provided', () => {
            assert.throws(() => {
                // tslint:disable-next-line no-any
                subscription.seek();
            }, /Either a snapshot name or Date is needed to seek to\./);
        });
        mocha_1.it('should make the correct api request', done => {
            FakeSnapshot.formatName_ = (projectId, name) => {
                assert.strictEqual(projectId, PROJECT_ID);
                assert.strictEqual(name, FAKE_SNAPSHOT_NAME);
                return FAKE_FULL_SNAPSHOT_NAME;
            };
            subscription.request = (config) => {
                assert.strictEqual(config.client, 'SubscriberClient');
                assert.strictEqual(config.method, 'seek');
                assert.deepStrictEqual(config.reqOpts, {
                    subscription: subscription.name,
                    snapshot: FAKE_FULL_SNAPSHOT_NAME,
                });
                done();
            };
            subscription.seek(FAKE_SNAPSHOT_NAME, assert.ifError);
        });
        mocha_1.it('should optionally accept a Date object', done => {
            const date = new Date();
            const reqOpts = { subscription: SUB_FULL_NAME, time: date };
            subscription.request = (config) => {
                assert.deepStrictEqual(config.reqOpts, reqOpts);
                done();
            };
            subscription.seek(date, assert.ifError);
        });
        mocha_1.it('should optionally accept gax options', done => {
            const gaxOpts = {};
            subscription.request = (config) => {
                assert.strictEqual(config.gaxOpts, gaxOpts);
                done();
            };
            subscription.seek(FAKE_SNAPSHOT_NAME, gaxOpts, assert.ifError);
        });
    });
    mocha_1.describe('setMetadata', () => {
        const METADATA = {
            pushEndpoint: 'http://noop.com/push',
        };
        beforeEach(() => {
            Subscription.formatMetadata_ = (metadata) => {
                return Object.assign({}, metadata);
            };
        });
        mocha_1.it('should make the correct request', done => {
            const formattedMetadata = {
                pushConfig: {
                    pushEndpoint: METADATA.pushEndpoint,
                },
            };
            const expectedBody = Object.assign({
                name: SUB_FULL_NAME,
            }, formattedMetadata);
            Subscription.formatMetadata_ = metadata => {
                assert.strictEqual(metadata, METADATA);
                return formattedMetadata;
            };
            const reqOpts = {
                subscription: expectedBody,
                updateMask: {
                    paths: ['push_config'],
                },
            };
            subscription.request = (config) => {
                assert.strictEqual(config.client, 'SubscriberClient');
                assert.strictEqual(config.method, 'updateSubscription');
                assert.deepStrictEqual(config.reqOpts, reqOpts);
                done();
            };
            subscription.setMetadata(METADATA, done);
        });
        mocha_1.it('should optionally accept gax options', done => {
            const gaxOpts = {};
            subscription.request = (config) => {
                assert.strictEqual(config.gaxOpts, gaxOpts);
                done();
            };
            subscription.setMetadata(METADATA, gaxOpts, done);
        });
    });
    mocha_1.describe('setOptions', () => {
        mocha_1.it('should pass the options to the subscriber', () => {
            const options = {};
            const stub = sandbox.stub(subscriber, 'setOptions').withArgs(options);
            subscription.setOptions(options);
            assert.strictEqual(stub.callCount, 1);
        });
    });
    mocha_1.describe('snapshot', () => {
        const SNAPSHOT_NAME = 'a';
        mocha_1.it('should call through to pubsub.snapshot', done => {
            // tslint:disable-next-line no-any
            PUBSUB.snapshot = function (name) {
                assert.strictEqual(this, subscription);
                assert.strictEqual(name, SNAPSHOT_NAME);
                done();
            };
            subscription.snapshot(SNAPSHOT_NAME);
        });
    });
});
//# sourceMappingURL=subscription.js.map