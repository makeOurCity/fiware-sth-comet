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
 * Characterization tests of the behaviour of the HTTP API when the database is not available.
 *
 * - The default tests close the connection to the database using the sthDatabase module and open it again
 *   afterwards. The responses are compared with test/unit/snapshots/sthDatabaseOutage.json (see
 *   test/unit/sthSnapshot.js to record them again).
 * - The opt-in test stops and starts a real MongoDB server run in a Docker container to check that the STH
 *   reconnects automatically. It is skipped unless the STH_TEST_DOCKER_MONGO environment variable is set to the name
 *   of the container, which must be started without the --rm option (since it is stopped and started again) and
 *   reachable at DB_URI. The docker command must be available. For example:
 *
 *       docker run -d --name sth-mongo-outage -p 27018:27017 mongo:8.0
 *       DB_URI=localhost:27018 STH_TEST_DOCKER_MONGO=sth-mongo-outage \
 *           npx mocha test/unit/sthDatabaseOutage_test.js --timeout 3000 --exit
 *       docker rm -f sth-mongo-outage
 */

/* eslint-disable consistent-return */

const ROOT_PATH = require('app-root-path');
const sthConfig = require(ROOT_PATH + '/lib/configuration/sthConfiguration');
const sthDatabase = require(ROOT_PATH + '/lib/database/sthDatabase');
const sthDatabaseNaming = require(ROOT_PATH + '/lib/database/model/sthDatabaseNaming');
const sthServer = require(ROOT_PATH + '/lib/server/sthServer');
const sthConfigurationPin = require(ROOT_PATH + '/test/unit/sthConfigurationPin');
const sthHttpTestClient = require(ROOT_PATH + '/test/unit/sthHttpTestClient');
const sthSnapshot = require(ROOT_PATH + '/test/unit/sthSnapshot');
const childProcess = require('child_process');
const expect = require('expect.js');
const path = require('path');

const SERVICE_HEADERS = { 'Fiware-Service': 'sthoutage', 'Fiware-ServicePath': '/outage' };
const TIME_INSTANT = '2026-10-23T10:15:30.000Z';
const V1_PATH = '/STH/v1/contextEntities/type/T/id/E1/attributes/temperature';
const AGGREGATED_PATH = V1_PATH + '?aggrMethod=sum&aggrPeriod=hour';
const DOCKER_MONGO_CONTAINER = process.env.STH_TEST_DOCKER_MONGO;
// Some requests get no response while the connection is closed. A short timeout keeps the tests fast and below the
//  mocha timeout
const REQUEST_TIMEOUT = 1500;

/**
 * Returns the notification of a numeric attribute
 * @return {Object} The notification body
 */
function getNotification() {
    return {
        subscriptionId: '1234567890ABCDF123456789',
        originator: 'orion.contextBroker.instance',
        contextResponses: [
            {
                contextElement: {
                    attributes: [
                        {
                            name: 'temperature',
                            type: 'Number',
                            value: '21.5',
                            metadatas: [{ name: 'TimeInstant', type: 'ISO8601', value: TIME_INSTANT }]
                        }
                    ],
                    type: 'T',
                    isPattern: 'false',
                    id: 'E1'
                },
                statusCode: { code: '200', reasonPhrase: 'OK' }
            }
        ]
    };
}

/**
 * Returns the requests whose responses are compared with their snapshots
 * @return {Object} The requests by name
 */
function getRequests() {
    return {
        aggregated: { method: 'GET', path: AGGREGATED_PATH },
        raw: { method: 'GET', path: V1_PATH + '?lastN=10' },
        rawV2: { method: 'GET', path: '/STH/v2/entities/E1/attrs/temperature?type=T&lastN=10' },
        csv: { method: 'GET', path: V1_PATH + '?lastN=10&filetype=csv' },
        notify: { method: 'POST', path: '/notify', body: getNotification() },
        deleteAttribute: { method: 'DELETE', path: '/STH/v1/contextEntities/type/T/id/E1/attributes/temperature' },
        deleteEntity: { method: 'DELETE', path: '/STH/v1/contextEntities/type/T/id/E1' },
        deleteAll: { method: 'DELETE', path: '/STH/v1/contextEntities' },
        version: { method: 'GET', path: '/version', headers: {} }
    };
}

/**
 * Sends a request including the service headers
 * @param {String} name The request name, used as correlator
 * @param {Object} request The request
 * @param {Function} callback The callback
 */
function send(name, request, callback) {
    sthHttpTestClient.sendRequest(
        {
            method: request.method,
            path: request.path,
            headers: Object.assign({ 'Fiware-Correlator': 'outage-' + name }, request.headers || SERVICE_HEADERS),
            body: request.body,
            timeout: REQUEST_TIMEOUT
        },
        callback
    );
}

/**
 * Connects to the database
 * @param {Object} options Additional connection options
 * @param {Function} callback The callback
 */
function connect(options, callback) {
    sthDatabase.connect(
        Object.assign(
            {
                authentication: sthConfig.DB_AUTHENTICATION,
                dbURI: sthConfig.DB_URI,
                replicaSet: sthConfig.REPLICA_SET,
                database: sthDatabaseNaming.getDatabaseName(sthConfig.DEFAULT_SERVICE),
                poolSize: sthConfig.POOL_SIZE
            },
            options
        ),
        callback
    );
}

/**
 * Starts the server, removes any previous data of the test service and notifies the test data
 * @param {Object} connectOptions Additional connection options
 * @param {Function} callback The callback
 */
function setUp(connectOptions, callback) {
    connect(connectOptions, function (err) {
        if (err) {
            return callback(err);
        }
        sthServer.startServer(sthConfig.STH_HOST, sthConfig.STH_PORT, function (err) {
            if (err) {
                return callback(err);
            }
            send('cleanUp', getRequests().deleteAll, function () {
                send('seed', getRequests().notify, function (err, response) {
                    if (!err && response.statusCode !== 200) {
                        err = new Error('Unexpected response to the seed notification: ' + response.statusCode);
                    }
                    callback(err);
                });
            });
        });
    });
}

/**
 * Removes the test data and stops the server
 * @param {Function} callback The callback
 */
function tearDown(callback) {
    function removeDataAndStop() {
        send('cleanUp', getRequests().deleteAll, function () {
            sthServer.stopServer(function () {
                sthDatabase.closeConnection(function () {
                    callback();
                });
            });
        });
    }

    if (sthDatabase.connection) {
        return removeDataAndStop();
    }
    // The connection was closed by the test
    return connect({}, removeDataAndStop);
}

/**
 * Sends a request repeatedly until the response has the expected status code
 * @param {Object} request The request
 * @param {Number} statusCode The expected status code
 * @param {Number} timeout Milliseconds to wait at most
 * @param {Function} callback Called with an error or with the response
 */
function waitForStatusCode(request, statusCode, timeout, callback) {
    const deadline = Date.now() + timeout;
    (function attempt() {
        send('poll', request, function (err, response) {
            if (!err && response.statusCode === statusCode) {
                return callback(null, response);
            }
            if (Date.now() > deadline) {
                return callback(
                    new Error(
                        'No ' + statusCode + ' response within ' + timeout + 'ms, last one: ' + (err || response.body)
                    )
                );
            }
            setTimeout(attempt, 250);
        });
    })();
}

describe('Database outage', function () {
    let restoreConfiguration;

    before(function () {
        // The responses depend on the data model and the naming of the collections
        restoreConfiguration = sthConfigurationPin.pinInitialConfiguration();
    });

    after(function () {
        restoreConfiguration();
    });

    describe('closing and opening the connection', function () {
        const matcher = sthSnapshot.createMatcher(path.join(__dirname, 'snapshots', 'sthDatabaseOutage.json'));
        const requests = getRequests();

        before(function (done) {
            setUp({}, done);
        });

        after(function (done) {
            matcher.save();
            tearDown(done);
        });

        /**
         * Defines a snapshot test of a request
         * @param {String} phase The phase of the outage
         * @param {String} name The request name
         */
        function snapshotTest(phase, name) {
            const request = requests[name];
            it(phase + '.' + name + ': ' + request.method + ' ' + request.path, function (done) {
                send(
                    name,
                    request,
                    sthHttpTestClient.assertResponse(done, function (err, response) {
                        matcher.match(phase + '.' + name, sthSnapshot.toSnapshot(request, err, response));
                    })
                );
            });
        }

        describe('before the outage', function () {
            snapshotTest('beforeOutage', 'aggregated');
        });

        describe('while the connection is closed', function () {
            before(function (done) {
                sthDatabase.closeConnection(done);
            });

            [
                'aggregated',
                'raw',
                'rawV2',
                'csv',
                'notify',
                'deleteAttribute',
                'deleteEntity',
                'deleteAll',
                'version'
            ].forEach(snapshotTest.bind(null, 'duringOutage'));
        });

        describe('after opening the connection again', function () {
            before(function (done) {
                connect({}, done);
            });

            snapshotTest('afterOutage', 'aggregated');
            snapshotTest('afterOutage', 'raw');
        });
    });

    (DOCKER_MONGO_CONTAINER ? describe : describe.skip)(
        'stopping and starting the MongoDB container (opt-in, STH_TEST_DOCKER_MONGO=<container>)',
        function () {
            before(function (done) {
                this.timeout(10000);
                // Close any connection left open by previous tests so that the reconnection options are applied
                sthDatabase.closeConnection(function () {
                    setUp({ reconnectTries: 120, reconnectInterval: 500 }, done);
                });
            });

            after(function (done) {
                this.timeout(60000);
                // Make sure the container is running again even if the test failed
                childProcess.exec('docker start ' + DOCKER_MONGO_CONTAINER, function () {
                    waitForStatusCode(getRequests().aggregated, 200, 50000, function () {
                        tearDown(done);
                    });
                });
            });

            it('should respond with 500 while MongoDB is stopped and recover automatically once started', function (done) {
                this.timeout(120000);
                const aggregated = getRequests().aggregated;
                let expected;
                send('beforeStop', aggregated, function (err, response) {
                    if (err) {
                        return done(err);
                    }
                    expected = JSON.parse(response.body);
                    childProcess.exec('docker stop ' + DOCKER_MONGO_CONTAINER, function (err) {
                        if (err) {
                            return done(err);
                        }
                        waitForStatusCode(aggregated, 500, 20000, function (err, response) {
                            if (err) {
                                return done(err);
                            }
                            try {
                                expect(JSON.parse(response.body).message).to.equal('MongoDB is not connected');
                            } catch (assertionError) {
                                return done(assertionError);
                            }
                            const startTime = Date.now();
                            childProcess.exec('docker start ' + DOCKER_MONGO_CONTAINER, function (err) {
                                if (err) {
                                    return done(err);
                                }
                                waitForStatusCode(aggregated, 200, 60000, function (err, response) {
                                    if (err) {
                                        return done(err);
                                    }
                                    try {
                                        expect(JSON.parse(response.body)).to.eql(expected);
                                    } catch (assertionError) {
                                        return done(assertionError);
                                    }
                                    // eslint-disable-next-line no-console
                                    console.log(
                                        '      Recovered ' + (Date.now() - startTime) + 'ms after docker start'
                                    );
                                    return done();
                                });
                            });
                        });
                    });
                });
            });
        }
    );
});
