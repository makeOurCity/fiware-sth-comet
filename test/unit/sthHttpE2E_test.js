/*
 * Copyright 2026 makeOurCity fork contributors
 *
 * This file is part of the Short Time Historic (STH) component
 *
 * STH is free software: you can redistribute it and/or
 * modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version.
 *
 * STH is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 * See the GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public
 * License along with STH.
 * If not, see http://www.gnu.org/licenses/.
 */

/*
 * E2E tests sending real HTTP requests to a running STH server.
 *
 * They detect that, with hapi 16 on Node.js 16+, the server does not send a (complete) response to the requests
 *  whose payload hapi reads, such as POST /notify and DELETE, since hapi 16 handles the 'close' event emitted by
 *  Node.js once the request body has been read as a client disconnection (see node_modules/hapi/lib/request.js).
 *  GET requests are not affected because hapi does not read their payload.
 *
 * Each request times out after a short time, so that a hanging request makes its own test fail fast without
 *  affecting the rest of the test suite.
 *
 * Notes about why the previously existing tests did not reveal the problem on Node.js 16+:
 *  - Most of the POST /notify and DELETE tests are in sth_test.js, which mocha runs last. When the DELETE test
 *    in sthE2E_test.js timed out, its request callback was called later on and the assertion thrown there
 *    reached the uncaughtException handler of lib/sth.js, which stops the server. The run ended before
 *    sth_test.js was executed.
 *  - The request handlers are executed anyway, only the response is lost. Thus, the data is stored or removed
 *    and the tests checking it afterwards with GET requests pass.
 *  - Whether the response is lost depends on the timing between the reply and the 'close' event. For example,
 *    the 400 - Bad Request response to a notification without attributes, which is replied synchronously, is
 *    received complete by this client on Node.js 22 and 24, but not on Node.js 16 nor using fetch().
 */

const ROOT_PATH = require('app-root-path');
const sthConfig = require(ROOT_PATH + '/lib/configuration/sthConfiguration');
const sthDatabase = require(ROOT_PATH + '/lib/database/sthDatabase');
const sthDatabaseNaming = require(ROOT_PATH + '/lib/database/model/sthDatabaseNaming');
const sthServer = require(ROOT_PATH + '/lib/server/sthServer');
const sthHttpTestClient = require(ROOT_PATH + '/test/unit/sthHttpTestClient');
const expect = require('expect.js');

const ENTITY_ID = 'httpE2EEntity';
const ENTITY_TYPE = 'httpE2EType';
const ATTR_NAME = 'temperature';
const ATTR_VALUE = '21.5';
const TIME_INSTANT = '2026-01-01T00:00:00.000Z';

const FIWARE_HEADERS = {
    Accept: 'application/json',
    'Fiware-Service': sthConfig.DEFAULT_SERVICE,
    'Fiware-ServicePath': sthConfig.DEFAULT_SERVICE_PATH
};

/**
 * Returns an NGSIv1 notification as sent by the Orion Context Broker
 * @param {Array} attributes The attributes of the notified entity
 * @return {Object} The notification body
 */
function getNotification(attributes) {
    return {
        subscriptionId: '1234567890ABCDF123456789',
        originator: 'orion.contextBroker.instance',
        contextResponses: [
            {
                contextElement: {
                    attributes,
                    type: ENTITY_TYPE,
                    isPattern: 'false',
                    id: ENTITY_ID
                },
                statusCode: {
                    code: '200',
                    reasonPhrase: 'OK'
                }
            }
        ]
    };
}

/**
 * Returns the path to get the raw data of the test attribute using the NGSIv2 API
 * @return {String} The path
 */
function getRawDataPath() {
    return '/STH/v2/entities/' + ENTITY_ID + '/attrs/' + ATTR_NAME + '?type=' + ENTITY_TYPE + '&lastN=10';
}

/**
 * Returns the path to delete the data of the test attribute
 * @return {String} The path
 */
function getAttributeRemovalPath() {
    return '/STH/v1/contextEntities/type/' + ENTITY_TYPE + '/id/' + ENTITY_ID + '/attributes/' + ATTR_NAME;
}

/**
 * Removes the test attribute data directly from the database, without using the HTTP API
 * @param {Function} callback The callback
 */
function removeTestData(callback) {
    sthDatabase.removeData(
        {
            service: sthConfig.DEFAULT_SERVICE,
            servicePath: sthConfig.DEFAULT_SERVICE_PATH,
            entityId: ENTITY_ID,
            entityType: ENTITY_TYPE,
            attrName: ATTR_NAME
        },
        function (err) {
            if (err && err.message.includes('does not exist')) {
                // There was no data to remove
                return callback();
            }
            return callback(err);
        }
    );
}

describe('HTTP E2E tests', function () {
    before(function (done) {
        sthDatabase.connect(
            {
                authentication: sthConfig.DB_AUTHENTICATION,
                dbURI: sthConfig.DB_URI,
                replicaSet: sthConfig.REPLICA_SET,
                database: sthDatabaseNaming.getDatabaseName(sthConfig.DEFAULT_SERVICE),
                poolSize: sthConfig.POOL_SIZE
            },
            function (err) {
                if (err) {
                    return done(err);
                }
                return removeTestData(function (err) {
                    if (err) {
                        return done(err);
                    }
                    return sthServer.startServer(sthConfig.STH_HOST, sthConfig.STH_PORT, function (err) {
                        done(err);
                    });
                });
            }
        );
    });

    after(function (done) {
        sthServer.stopServer(function () {
            removeTestData(function () {
                sthDatabase.closeConnection(function () {
                    done();
                });
            });
        });
    });

    describe('GET /version', function () {
        it('should respond with 200 - OK and the version', function (done) {
            sthHttpTestClient.sendRequest(
                { method: 'GET', path: '/version' },
                sthHttpTestClient.assertResponse(done, function (err, response) {
                    expect(err).to.equal(null);
                    expect(response.statusCode).to.equal(200);
                    expect(JSON.parse(response.body).version).to.be.a('string');
                })
            );
        });
    });

    describe('POST /notify', function () {
        it('should respond with 200 - OK to a notification of a numeric attribute', function (done) {
            sthHttpTestClient.sendRequest(
                {
                    method: 'POST',
                    path: '/notify',
                    headers: FIWARE_HEADERS,
                    body: getNotification([
                        {
                            name: ATTR_NAME,
                            type: 'Number',
                            value: ATTR_VALUE,
                            metadatas: [{ name: 'TimeInstant', type: 'ISO8601', value: TIME_INSTANT }]
                        }
                    ])
                },
                sthHttpTestClient.assertResponse(done, function (err, response) {
                    expect(err).to.equal(null);
                    expect(response.statusCode).to.equal(200);
                })
            );
        });

        it('should respond with 400 - Bad Request and the error details to a notification without attributes', function (done) {
            sthHttpTestClient.sendRequest(
                {
                    method: 'POST',
                    path: '/notify',
                    headers: FIWARE_HEADERS,
                    body: getNotification([])
                },
                sthHttpTestClient.assertResponse(done, function (err, response) {
                    expect(err).to.equal(null);
                    expect(response.statusCode).to.equal(400);
                    expect(JSON.parse(response.body).message).to.equal(
                        'At least one attribute with an aggregatable value should be included in the notification'
                    );
                })
            );
        });
    });

    describe('GET /STH/v2/entities/{entityId}/attrs/{attrName}', function () {
        it('should respond with 200 - OK and the notified raw data', function (done) {
            sthHttpTestClient.sendRequest(
                { method: 'GET', path: getRawDataPath(), headers: FIWARE_HEADERS },
                sthHttpTestClient.assertResponse(done, function (err, response) {
                    expect(err).to.equal(null);
                    expect(response.statusCode).to.equal(200);
                    const values = JSON.parse(response.body).value;
                    expect(values.length).to.equal(1);
                    expect(values[0].recvTime).to.equal(TIME_INSTANT);
                    expect(String(values[0].attrValue)).to.equal(ATTR_VALUE);
                })
            );
        });
    });

    describe('DELETE /STH/v1/contextEntities/type/{entityType}/id/{entityId}/attributes/{attrName}', function () {
        it('should respond with 204 - No Content', function (done) {
            sthHttpTestClient.sendRequest(
                { method: 'DELETE', path: getAttributeRemovalPath(), headers: FIWARE_HEADERS },
                sthHttpTestClient.assertResponse(done, function (err, response) {
                    expect(err).to.equal(null);
                    expect(response.statusCode).to.equal(204);
                })
            );
        });

        it('should not return the deleted raw data afterwards', function (done) {
            sthHttpTestClient.sendRequest(
                { method: 'GET', path: getRawDataPath(), headers: FIWARE_HEADERS },
                sthHttpTestClient.assertResponse(done, function (err, response) {
                    expect(err).to.equal(null);
                    expect(response.statusCode).to.equal(200);
                    expect(JSON.parse(response.body).value).to.eql([]);
                })
            );
        });
    });
});
